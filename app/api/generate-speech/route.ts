import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { requireProUser } from '@/app/lib/requireProUser'
import { GEMINI_TTS_MODEL } from '@/app/lib/geminiModels'
import { normalizeGeminiTtsVoice, pcmToWav } from '@/app/lib/geminiTts'
import {
  analyzeSpeechReferenceDelivery,
  mergeSpeechPromptWithReferenceDelivery,
} from '@/app/lib/geminiTtsVoiceMatch'

interface SpeechSpeakerInput {
  name: string
  voiceName: string
}

interface ReferenceAudioInput {
  audioBase64: string
  mimeType: string
}

interface GenerateSpeechRequest {
  prompt: string
  voiceName?: string
  multiSpeaker?: boolean
  speakers?: SpeechSpeakerInput[]
  referenceAudio?: ReferenceAudioInput
}

function buildSpeechConfig(body: GenerateSpeechRequest) {
  const speakers = body.speakers?.filter((s) => s.name && s.voiceName) ?? []
  if (body.multiSpeaker && speakers.length >= 2) {
    return {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakers.slice(0, 2).map((speaker) => ({
          speaker: speaker.name,
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: normalizeGeminiTtsVoice(speaker.voiceName),
            },
          },
        })),
      },
    }
  }
  return {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: normalizeGeminiTtsVoice(body.voiceName),
      },
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser({ consumeQuota: true })
    if ('error' in auth) return auth.error

    const body: GenerateSpeechRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    let prompt = body.prompt.trim()

    const referenceAudio = body.referenceAudio
    const canMatchReference =
      referenceAudio?.audioBase64 &&
      typeof referenceAudio.audioBase64 === 'string' &&
      referenceAudio.mimeType &&
      typeof referenceAudio.mimeType === 'string' &&
      !body.multiSpeaker

    if (canMatchReference) {
      const deliveryNotes = await analyzeSpeechReferenceDelivery({
        audioBase64: referenceAudio.audioBase64,
        mimeType: referenceAudio.mimeType,
      })
      prompt = mergeSpeechPromptWithReferenceDelivery(prompt, deliveryNotes)
    }

    const ai = getGenAIClient()
    const response = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: buildSpeechConfig(body),
      },
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    const audioPart = parts.find((part) => part.inlineData?.data)
    const audioBase64 = audioPart?.inlineData?.data
    if (!audioBase64) {
      return NextResponse.json({ error: 'No speech audio was generated' }, { status: 500 })
    }

    const pcm = Buffer.from(audioBase64, 'base64')
    const wav = pcmToWav(pcm)

    return NextResponse.json({
      success: true,
      audio_base64: wav.toString('base64'),
      audio_mime_type: 'audio/wav',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
