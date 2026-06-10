import { NextRequest, NextResponse } from 'next/server'
import { VideoGenerationReferenceType } from '@google/genai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { requireProUser } from '@/app/lib/requireProUser'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { VEO_VIDEO_MODEL } from '@/app/lib/geminiModels'

interface ReferenceImageInput {
  base64: string
  mimeType: string
}

interface GenerateVideoRequest {
  prompt: string
  negativePrompt?: string
  referenceImages?: ReferenceImageInput[]
  firstFrame?: ReferenceImageInput
  lastFrame?: ReferenceImageInput
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser({ consumeQuota: true })
    if ('error' in auth) return auth.error

    const body: GenerateVideoRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const negativePrompt = body.negativePrompt?.trim() || undefined

    const prompt = body.prompt.trim()
    const cappedRefs = body.referenceImages?.slice(0, 3) ?? []
    const referenceImages = cappedRefs.map((img) => ({
      image: {
        imageBytes: img.base64,
        mimeType: img.mimeType,
      },
      referenceType: VideoGenerationReferenceType.ASSET,
    }))

    const firstFrameImage = body.firstFrame
      ? {
          imageBytes: body.firstFrame.base64,
          mimeType: body.firstFrame.mimeType,
        }
      : undefined

    const lastFrameImage = body.lastFrame
      ? {
          imageBytes: body.lastFrame.base64,
          mimeType: body.lastFrame.mimeType,
        }
      : undefined

    const usesReferenceImages = referenceImages.length > 0

    let operation = await ai.models.generateVideos({
      model: VEO_VIDEO_MODEL,
      prompt,
      ...(firstFrameImage && { image: firstFrameImage }),
      config: {
        numberOfVideos: 1,
        aspectRatio: FIXED_ASPECT_RATIO,
        ...(usesReferenceImages && { durationSeconds: 8 }),
        ...(negativePrompt && { negativePrompt }),
        ...(usesReferenceImages && { referenceImages }),
        ...(lastFrameImage && { lastFrame: lastFrameImage }),
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
        { error: 'Video generation failed', details: operation.error },
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
    const tempFilePath = path.join(tempDir, `video-${Date.now()}.mp4`)

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
    const videoBase64 = buffer.toString('base64')

    return NextResponse.json({
      success: true,
      video_base64: videoBase64,
      video_mime_type: mimeType,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
