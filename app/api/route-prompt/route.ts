import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { FunctionCallingConfigMode, FunctionDeclaration, Tool, Type } from '@google/genai'

interface RoutePromptRequest {
  prompt: string
  aspectRatio?: '16:9' | '9:16'
}

type RoutedAction = 'generate_image' | 'generate_video' | 'no_op'

interface RoutePromptResponse {
  action: RoutedAction
  params: {
    prompt?: string
    aspectRatio?: '16:9' | '9:16'
    negativePrompt?: string
  } | null
  message: string
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'generate_image',
    description: 'Generate a still image from a text description. Use this when the user asks to create, generate, draw, paint, or produce an image, photo, picture, illustration, or any visual that is a single frame.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: "A refined, detailed prompt for image generation based on the user's request.",
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'Aspect ratio for the image. Use "16:9" for landscape/widescreen or "9:16" for portrait/vertical.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate a video clip from a text description. Use this when the user asks to create, generate, animate, or produce a video, clip, animation, motion, or anything that involves movement over time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: "A refined, detailed prompt for video generation based on the user's request.",
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'Aspect ratio for the video. Use "16:9" for landscape/widescreen or "9:16" for portrait/vertical.',
        },
        negativePrompt: {
          type: Type.STRING,
          description: 'Optional description of things to avoid in the video, e.g. "blurry, low quality, distorted".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'no_op',
    description: "Use this when the user's message is not a request to generate an image or video — for example if it's a question, a greeting, or an unrelated request.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'A short, friendly message explaining that only image and video generation is supported.',
        },
      },
      required: ['reason'],
    },
  },
]

const tools: Tool[] = [{ functionDeclarations }]

export async function POST(request: NextRequest) {
  try {
    const body: RoutePromptRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const aspectRatioContext = body.aspectRatio ? ` The current canvas aspect ratio is ${body.aspectRatio}.` : ''

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: body.prompt.trim() + aspectRatioContext }],
        },
      ],
      config: {
        systemInstruction: 'You are a routing assistant for a media generation studio. Your only job is to call the correct function: generate_image for still image requests, generate_video for video or animation requests, or no_op for anything else. Always call exactly one function.',
        tools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['generate_image', 'generate_video', 'no_op'],
          },
        },
      },
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts

    if (!parts || parts.length === 0) {
      return NextResponse.json({ error: 'No response from routing model' }, { status: 500 })
    }

    const functionCallPart = parts.find((p) => p.functionCall)
    if (!functionCallPart?.functionCall) {
      return NextResponse.json({ error: 'Router did not return a function call' }, { status: 500 })
    }

    const { name, args } = functionCallPart.functionCall
    const action = name as RoutedAction

    let result: RoutePromptResponse

    if (action === 'generate_image') {
      result = {
        action: 'generate_image',
        params: {
          prompt: (args?.prompt as string) || body.prompt.trim(),
          aspectRatio: (args?.aspectRatio as '16:9' | '9:16') || body.aspectRatio || '16:9',
        },
        message: 'Generating image...',
      }
    } else if (action === 'generate_video') {
      result = {
        action: 'generate_video',
        params: {
          prompt: (args?.prompt as string) || body.prompt.trim(),
          aspectRatio: (args?.aspectRatio as '16:9' | '9:16') || body.aspectRatio || '16:9',
          negativePrompt: (args?.negativePrompt as string) || undefined,
        },
        message: 'Generating video...',
      }
    } else {
      result = {
        action: 'no_op',
        params: null,
        message: (args?.reason as string) || 'I can only help with image and video generation.',
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
