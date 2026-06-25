import { Type } from '@google/genai'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { GEMINI_TRANSCRIBE_MODEL } from '@/app/lib/geminiModels'

export interface AnalyzeSpeechReferenceInput {
  audioBase64: string
  mimeType: string
}

export async function analyzeSpeechReferenceDelivery(
  input: AnalyzeSpeechReferenceInput
): Promise<string> {
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
              'Listen to this speech clip. Write concise delivery notes (2-4 sentences) describing the speaker character, pace, tone, pitch, energy, and speaking style so a TTS model can mimic this performance in new words. ' +
              'Do not transcribe the words; focus on how it is spoken.',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          deliveryNotes: { type: Type.STRING },
        },
        required: ['deliveryNotes'],
      },
    },
  })

  const text = response.text
  if (!text) {
    throw new Error('No reference delivery analysis returned')
  }

  const parsed = JSON.parse(text) as { deliveryNotes?: string }
  const deliveryNotes = typeof parsed.deliveryNotes === 'string' ? parsed.deliveryNotes.trim() : ''
  if (!deliveryNotes) {
    throw new Error('Reference delivery analysis did not include delivery notes')
  }

  return deliveryNotes
}

export function mergeSpeechPromptWithReferenceDelivery(
  userPrompt: string,
  deliveryNotes: string
): string {
  return `${deliveryNotes.trim()}\n\n${userPrompt.trim()}`
}
