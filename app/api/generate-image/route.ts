import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { requireProUser } from '@/app/lib/requireProUser'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { GEMINI_IMAGE_MODEL } from '@/app/lib/geminiModels'

interface ReferenceImageInput {
  base64: string
  mimeType: string
}

interface GenerateImageRequest {
  prompt: string
  referenceImages?: ReferenceImageInput[]
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser()
    if ('error' in auth) return auth.error

    const body: GenerateImageRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()

    type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } }
    const contentParts: ContentPart[] = [{ text: body.prompt.trim() }]

    if (body.referenceImages && body.referenceImages.length > 0) {
      for (const img of body.referenceImages) {
        contentParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        })
      }
    }

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: contentParts,
      config: {
        imageConfig: {
          aspectRatio: FIXED_ASPECT_RATIO,
          imageSize: '2K',
        },
      },
    })

    const parts = response.candidates?.[0]?.content?.parts
    if (!parts) {
      return NextResponse.json({ error: 'No content in response' }, { status: 500 })
    }

    let imageBase64: string | null = null
    let imageMimeType = 'image/png'

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data
        imageMimeType = part.inlineData.mimeType || 'image/png'
      }
    }

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image was generated' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      image_base64: imageBase64,
      image_mime_type: imageMimeType,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
