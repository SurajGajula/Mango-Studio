import { Type } from '@google/genai'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { GEMINI_TRANSCRIBE_MODEL } from '@/app/lib/geminiModels'

export interface TranscribeWord {
  text: string
  startTime: number
  endTime: number
}

export interface TranscribeSegment {
  text: string
  startTime: number
  endTime: number
  words: TranscribeWord[]
}

export interface TranscribeAudioInput {
  audioBase64: string
  mimeType: string
  trimStart?: number
  trimEnd?: number
  originalDuration?: number
}

function isValidWord(word: TranscribeWord, segmentStart: number, segmentEnd: number): boolean {
  return (
    typeof word.text === 'string' &&
    word.text.trim().length > 0 &&
    typeof word.startTime === 'number' &&
    typeof word.endTime === 'number' &&
    word.endTime > word.startTime &&
    word.startTime >= segmentStart &&
    word.startTime < segmentEnd
  )
}

function segmentEndFromWords(segment: TranscribeSegment, words: TranscribeWord[]): number {
  if (words.length === 0) return segment.endTime
  return Math.max(segment.endTime, ...words.map((w) => w.endTime))
}

function normalizeSegmentWords(segment: TranscribeSegment): TranscribeWord[] {
  return (segment.words ?? [])
    .map((w) => ({
      text: w.text.trim(),
      startTime: w.startTime,
      endTime: w.endTime,
    }))
    .filter((w) => isValidWord(w, segment.startTime, segment.endTime))
}

export async function transcribeAudioSegments(input: TranscribeAudioInput): Promise<TranscribeSegment[]> {
  const trimStart = input.trimStart ?? 0
  const trimEnd = input.trimEnd ?? 0
  const originalDuration = input.originalDuration
  const regionEnd =
    originalDuration !== undefined ? Math.max(0, originalDuration - trimEnd) : undefined

  const regionInstruction =
    originalDuration !== undefined
      ? `Only transcribe the audio from ${trimStart.toFixed(3)}s to ${regionEnd!.toFixed(3)}s in the source file. Return segment startTime and endTime as seconds relative to ${trimStart.toFixed(3)}s (0 = region start).`
      : 'Return segment startTime and endTime as seconds from the start of the audio (0-based).'

  const ai = getGenAIClient()
  const response = await ai.models.generateContent({
    model: GEMINI_TRANSCRIBE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: input.mimeType,
              data: input.audioBase64,
            },
          },
          {
            text:
              'Transcribe this audio into subtitle-sized phrases. ' +
              regionInstruction +
              ' Split at natural phrase boundaries. Omit filler words only when they add no meaning. ' +
              'For each segment include a words array listing every spoken word in order with accurate startTime and endTime on the same timeline as the segment timestamps.',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      startTime: { type: Type.NUMBER },
                      endTime: { type: Type.NUMBER },
                    },
                    required: ['text', 'startTime', 'endTime'],
                  },
                },
              },
              required: ['text', 'startTime', 'endTime', 'words'],
            },
          },
        },
        required: ['segments'],
      },
    },
  })

  const text = response.text
  if (!text) {
    throw new Error('No transcription returned')
  }

  const parsed = JSON.parse(text) as { segments?: TranscribeSegment[] }
  return (parsed.segments ?? [])
    .filter(
      (s) =>
        typeof s.text === 'string' &&
        s.text.trim().length > 0 &&
        typeof s.startTime === 'number' &&
        typeof s.endTime === 'number' &&
        s.endTime > s.startTime
    )
    .map((s) => {
      const words = normalizeSegmentWords(s)
      return {
        text: s.text.trim(),
        startTime: s.startTime,
        endTime: segmentEndFromWords(s, words),
        words,
      }
    })
}

export function segmentsToScript(segments: TranscribeSegment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function transcribedAudioDurationSeconds(
  segments: TranscribeSegment[],
  trimStart = 0,
  trimEnd = 0,
  originalDuration?: number
): number {
  if (segments.length === 0) return 0
  const fromSegments = segments[segments.length - 1].endTime
  if (originalDuration !== undefined) {
    const regionLength = Math.max(0, originalDuration - trimStart - trimEnd)
    return Math.min(fromSegments, regionLength)
  }
  return fromSegments
}
