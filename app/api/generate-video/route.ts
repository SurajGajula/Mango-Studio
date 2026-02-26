import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

interface GenerateVideoRequest {
  prompt: string
  aspectRatio?: '16:9' | '9:16'
  negativePrompt?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateVideoRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const aspectRatio = body.aspectRatio || '16:9'
    const negativePrompt = body.negativePrompt?.trim() || undefined

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: body.prompt,
      config: {
        numberOfVideos: 1,
        aspectRatio: aspectRatio,
        ...(negativePrompt && { negativePrompt }),
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
