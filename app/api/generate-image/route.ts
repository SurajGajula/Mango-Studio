import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'

interface ReferenceImageInput {
  base64: string
  mimeType: string
}

interface GenerateImageRequest {
  prompt: string
  referenceImages?: ReferenceImageInput[]
}

export async function POST(request: NextRequest) {
  console.log('[generate-image] Starting request')
  
  try {
    const body: GenerateImageRequest = await request.json()
    console.log('[generate-image] Request body:', JSON.stringify({ ...body, referenceImages: body.referenceImages?.length || 0 }, null, 2))

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    console.log('[generate-image] Got GenAI client')

    type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } }
    const contentParts: ContentPart[] = [{ text: body.prompt }]

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

    console.log('[generate-image] Calling generateContent with', contentParts.length, 'parts')
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: contentParts,
      config: {
        responseModalities: ['Text', 'Image'],
      },
    })
    console.log('[generate-image] Got response')

    if (!response.candidates || response.candidates.length === 0) {
      console.log('[generate-image] No candidates in response')
      return NextResponse.json({ error: 'No response from image generation' }, { status: 500 })
    }

    const parts = response.candidates[0].content?.parts
    console.log('[generate-image] Parts count:', parts?.length || 0)
    
    if (!parts) {
      console.log('[generate-image] No parts in content')
      return NextResponse.json({ error: 'No content in response' }, { status: 500 })
    }

    let imageBase64: string | null = null
    let imageMimeType: string = 'image/png'
    let textResponse: string | null = null

    for (const part of parts) {
      console.log('[generate-image] Part type:', part.text ? 'text' : part.inlineData ? 'inlineData' : 'unknown')
      if (part.text) {
        textResponse = part.text
      } else if (part.inlineData) {
        imageBase64 = part.inlineData.data || null
        imageMimeType = part.inlineData.mimeType || 'image/png'
        console.log('[generate-image] Image data length:', imageBase64?.length || 0)
      }
    }

    if (!imageBase64) {
      console.log('[generate-image] No image was generated')
      return NextResponse.json({ error: 'No image was generated' }, { status: 500 })
    }

    console.log('[generate-image] Success, returning image')
    return NextResponse.json({
      success: true,
      image_base64: imageBase64,
      image_mime_type: imageMimeType,
      text: textResponse,
    })
  } catch (error) {
    console.error('[generate-image] Caught error:', error)
    console.error('[generate-image] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
