import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { requireProUser } from '@/app/lib/requireProUser'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { VEO_VIDEO_MODEL } from '@/app/lib/geminiModels'
import {
  segmentsToScript,
  transcribeAudioSegments,
  transcribedAudioDurationSeconds,
} from '@/app/lib/geminiTranscribe'
import { veoDurationForAudioSeconds } from '@/app/lib/veoDurationSeconds'
import { veoSpeechPrompt } from '@/app/lib/veoSpeechPrompt'

interface ReferenceImageInput {
  base64: string
  mimeType: string
}

interface AnimateToSpeechRequest {
  firstFrame: ReferenceImageInput
  audioBase64: string
  mimeType: string
  trimStart?: number
  trimEnd?: number
  originalDuration?: number
  motionPrompt?: string
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser()
    if ('error' in auth) return auth.error

    const body: AnimateToSpeechRequest = await request.json()

    if (!body.firstFrame?.base64 || !body.firstFrame?.mimeType) {
      return NextResponse.json({ error: 'A first-frame image is required' }, { status: 400 })
    }

    if (!body.audioBase64 || typeof body.audioBase64 !== 'string') {
      return NextResponse.json({ error: 'Audio data is required' }, { status: 400 })
    }

    if (!body.mimeType || typeof body.mimeType !== 'string') {
      return NextResponse.json({ error: 'Audio mime type is required' }, { status: 400 })
    }

    const trimStart = body.trimStart ?? 0
    const trimEnd = body.trimEnd ?? 0

    const segments = await transcribeAudioSegments({
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      trimStart,
      trimEnd,
      originalDuration: body.originalDuration,
    })

    if (segments.length === 0) {
      return NextResponse.json({ error: 'No speech detected in the audio' }, { status: 422 })
    }

    const script = segmentsToScript(segments)
    if (!script) {
      return NextResponse.json({ error: 'No speech detected in the audio' }, { status: 422 })
    }

    const audioDuration = transcribedAudioDurationSeconds(
      segments,
      trimStart,
      trimEnd,
      body.originalDuration
    )
    const durationSeconds = veoDurationForAudioSeconds(audioDuration)
    const prompt = veoSpeechPrompt(script, body.motionPrompt)

    const ai = getGenAIClient()
    let operation = await ai.models.generateVideos({
      model: VEO_VIDEO_MODEL,
      prompt,
      image: {
        imageBytes: body.firstFrame.base64,
        mimeType: body.firstFrame.mimeType,
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: FIXED_ASPECT_RATIO,
        durationSeconds,
      },
    })

    const maxWaitTime = 600000
    const startTime = Date.now()
    const pollInterval = 10000

    while (!operation.done) {
      if (Date.now() - startTime > maxWaitTime) {
        return NextResponse.json(
          { error: 'Operation timeout: Video generation took too long' },
          { status: 500 }
        )
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      operation = await ai.operations.getVideosOperation({ operation })
    }

    if (operation.error) {
      return NextResponse.json(
        { error: 'Talking animation failed', details: operation.error },
        { status: 500 }
      )
    }

    if (!operation.response?.generatedVideos || operation.response.generatedVideos.length === 0) {
      return NextResponse.json({ error: 'No video was generated' }, { status: 500 })
    }

    const generatedVideo = operation.response.generatedVideos[0]
    const videoFile = generatedVideo.video

    if (!videoFile) {
      return NextResponse.json({ error: 'Video file not found in response' }, { status: 500 })
    }

    const tempDir = os.tmpdir()
    const tempFilePath = path.join(tempDir, `talking-${Date.now()}.mp4`)

    await ai.files.download({
      file: videoFile,
      downloadPath: tempFilePath,
    })

    const buffer = await fs.readFile(tempFilePath)
    await fs.unlink(tempFilePath).catch(() => {})

    if (!buffer || buffer.length < 50_000) {
      return NextResponse.json(
        { error: 'Generated video file is empty or too small' },
        { status: 502 }
      )
    }

    const mimeType = videoFile.mimeType || 'video/mp4'

    return NextResponse.json({
      success: true,
      video_base64: buffer.toString('base64'),
      video_mime_type: mimeType,
      script,
      durationSeconds,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('seconds or less') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
