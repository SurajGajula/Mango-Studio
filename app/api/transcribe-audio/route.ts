import { NextRequest, NextResponse } from 'next/server'
import { requireProUser } from '@/app/lib/requireProUser'
import { transcribeAudioSegments } from '@/app/lib/geminiTranscribe'

export type { TranscribeSegment } from '@/app/lib/geminiTranscribe'

interface TranscribeAudioRequest {
  audioBase64: string
  mimeType: string
  trimStart?: number
  trimEnd?: number
  originalDuration?: number
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser()
    if ('error' in auth) return auth.error

    const body: TranscribeAudioRequest = await request.json()

    if (!body.audioBase64 || typeof body.audioBase64 !== 'string') {
      return NextResponse.json({ error: 'Audio data is required' }, { status: 400 })
    }

    if (!body.mimeType || typeof body.mimeType !== 'string') {
      return NextResponse.json({ error: 'Audio mime type is required' }, { status: 400 })
    }

    const segments = await transcribeAudioSegments(body)

    if (segments.length === 0) {
      return NextResponse.json({ error: 'No speech detected in the audio' }, { status: 422 })
    }

    return NextResponse.json({ success: true, segments })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
