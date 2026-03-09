import { NextRequest, NextResponse } from 'next/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { FunctionCallingConfigMode, FunctionDeclaration, Tool, Type } from '@google/genai'

interface ManifestItem {
  id: string
  name?: string
  title?: string
  content?: string
  startTime?: number
  endTime?: number
  timestamp?: number
  duration?: number
  isOverlay?: boolean
  marks?: number[]
}

interface SerializedManifest {
  images?: ManifestItem[]
  videos?: ManifestItem[]
  texts?: ManifestItem[]
  audios?: ManifestItem[]
}

interface UploadedFileMeta {
  index: number
  name: string
}

interface RoutePromptRequest {
  prompt: string
  manifest?: SerializedManifest
  uploadedFiles?: UploadedFileMeta[]
}

export interface ManifestMutation {
  type: 'updateImage' | 'updateVideo' | 'updateText' | 'updateAudio'
  id: string
  startTime?: number
  endTime?: number
  timestamp?: number
  duration?: number
}

export interface SplitInstruction {
  type: 'image' | 'video'
  id: string
  times: number[]
}

export interface ReplaceInstruction {
  targetId: string
  fileIndex: number
}

export interface AddTextInstruction {
  content: string
  startTime: number
  endTime: number
}

type RoutedAction = 'no_op' | 'edit_manifest' | 'split_at_marks' | 'replace_images' | 'add_text'

interface RoutePromptResponse {
  action: RoutedAction
  mutations?: ManifestMutation[]
  splits?: SplitInstruction[]
  replacements?: ReplaceInstruction[]
  newTexts?: AddTextInstruction[]
  message: string
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'no_op',
    description: "Use this when the user's message cannot be fulfilled by editing the timeline — for example a question, a greeting, or a request that requires generating new content.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'A short, friendly message explaining what is supported.',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'edit_manifest',
    description: 'Edit, rearrange, resize, or synchronise existing items on the timeline. Use this when the user asks to change timing, duration, or position of existing images, videos, texts, or audio tracks — for example "make the image the same length as the audio" or "move the video to start at 5 seconds".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mutations: {
          type: Type.ARRAY,
          description: 'List of changes to apply to timeline items.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The kind of item to update. One of: updateImage, updateVideo, updateText, updateAudio.',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the item to update.',
              },
              startTime: {
                type: Type.NUMBER,
                description: 'New start time in seconds (for images, texts, audios).',
              },
              endTime: {
                type: Type.NUMBER,
                description: 'New end time in seconds (for images, texts, audios).',
              },
              timestamp: {
                type: Type.NUMBER,
                description: 'New start timestamp in seconds (for videos on the main track).',
              },
              duration: {
                type: Type.NUMBER,
                description: 'New duration in seconds (for videos).',
              },
            },
            required: ['type', 'id'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message describing what was changed.',
        },
      },
      required: ['mutations', 'message'],
    },
  },
  {
    name: 'split_at_marks',
    description: 'Split images or videos at the times of audio marks. Use this when the user asks to split, cut, or divide images or videos at the mark positions. For each item, include only the marks that fall within that item\'s time range.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        splits: {
          type: Type.ARRAY,
          description: 'List of items to split and the mark times at which to split them.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The type of item: "image" or "video".',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the item to split.',
              },
              times: {
                type: Type.ARRAY,
                description: 'The mark times (in seconds) within this item\'s range at which to split.',
                items: { type: Type.NUMBER },
              },
            },
            required: ['type', 'id', 'times'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Image split at 3 mark positions."',
        },
      },
      required: ['splits', 'message'],
    },
  },
  {
    name: 'add_text',
    description: 'Add one or more text overlays to the timeline. Use this when the user asks to add, insert, or place text at a specific time range — for example "add text the length of the first image" or "add a subtitle from the second to the fifth image". Compute startTime and endTime from the manifest data. The content should be taken from the user\'s prompt, or left as an empty string if not specified.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        texts: {
          type: Type.ARRAY,
          description: 'List of text overlays to add.',
          items: {
            type: Type.OBJECT,
            properties: {
              content: {
                type: Type.STRING,
                description: 'The text content. Use the exact wording from the user\'s prompt, or an empty string if no content was specified.',
              },
              startTime: {
                type: Type.NUMBER,
                description: 'Start time in seconds.',
              },
              endTime: {
                type: Type.NUMBER,
                description: 'End time in seconds.',
              },
            },
            required: ['content', 'startTime', 'endTime'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Text added from 0s to 5.2s."',
        },
      },
      required: ['texts', 'message'],
    },
  },
  {
    name: 'replace_images',
    description: 'Replace the source image of existing timeline images with uploaded files. Use this when the user attaches images and asks to replace, swap, or update existing images on the timeline with them. Map each target image id to the fileIndex of the uploaded file to use.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        replacements: {
          type: Type.ARRAY,
          description: 'List of replacements to perform.',
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: {
                type: Type.STRING,
                description: 'The id of the existing timeline image to replace.',
              },
              fileIndex: {
                type: Type.NUMBER,
                description: 'The 0-based index of the uploaded file to use as the new source.',
              },
            },
            required: ['targetId', 'fileIndex'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Replaced 24 images."',
        },
      },
      required: ['replacements', 'message'],
    },
  },
]

const tools: Tool[] = [{ functionDeclarations }]

function buildUploadedFilesContext(files: UploadedFileMeta[]): string {
  const lines = [`Attached files (${files.length}):`]
  for (const f of files) {
    lines.push(`  - index=${f.index} name="${f.name}"`)
  }
  return lines.join('\n')
}

function buildManifestContext(manifest: SerializedManifest): string {
  const lines: string[] = ['Current timeline contents:']

  if (manifest.images?.length) {
    lines.push(`Images (${manifest.images.length}):`)
    for (const img of manifest.images) {
      lines.push(`  - id="${img.id}" name="${img.name}" startTime=${img.startTime}s endTime=${img.endTime}s`)
    }
  }
  if (manifest.videos?.length) {
    lines.push(`Videos (${manifest.videos.length}):`)
    for (const vid of manifest.videos) {
      lines.push(`  - id="${vid.id}" title="${vid.title}" timestamp=${vid.timestamp}s duration=${vid.duration}s isOverlay=${vid.isOverlay}`)
    }
  }
  if (manifest.texts?.length) {
    lines.push(`Texts (${manifest.texts.length}):`)
    for (const txt of manifest.texts) {
      lines.push(`  - id="${txt.id}" content="${txt.content}" startTime=${txt.startTime}s endTime=${txt.endTime}s`)
    }
  }
  if (manifest.audios?.length) {
    lines.push(`Audios (${manifest.audios.length}):`)
    for (const aud of manifest.audios) {
      const markStr = aud.marks?.length ? aud.marks.map((m) => `${m.toFixed(3)}s`).join(', ') : 'none'
      lines.push(`  - id="${aud.id}" name="${aud.name}" startTime=${aud.startTime}s endTime=${aud.endTime}s marks=[${markStr}]`)
    }
  }

  if (lines.length === 1) lines.push('  (empty — no items yet)')

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const body: RoutePromptRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const manifestContext = body.manifest ? '\n\n' + buildManifestContext(body.manifest) : ''
    const filesContext = body.uploadedFiles?.length ? '\n\n' + buildUploadedFilesContext(body.uploadedFiles) : ''

    const systemInstruction =
      'You are a timeline editing assistant for a media studio. Your only job is to call the correct function:\n' +
      '- edit_manifest: when the user asks to change timing, duration, or position of existing items\n' +
      '- split_at_marks: when the user asks to split, cut, or divide images or videos at audio mark positions (use the marks listed in the audio data)\n' +
      '- add_text: when the user asks to add text overlays to the timeline at a computed time range\n' +
      '- replace_images: when the user has attached files and asks to replace, swap, or update existing timeline images with them\n' +
      '- no_op: for anything else\n' +
      'Always call exactly one function. Compute exact numeric values from the timeline data provided.'

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: body.prompt.trim() + manifestContext + filesContext }],
        },
      ],
      config: {
        systemInstruction,
        tools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['no_op', 'edit_manifest', 'split_at_marks', 'replace_images', 'add_text'],
          },
        },
      },
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts

    if (!parts || parts.length === 0) {
      return NextResponse.json({ error: 'No response from model' }, { status: 500 })
    }

    const functionCallPart = parts.find((p) => p.functionCall)
    if (!functionCallPart?.functionCall) {
      return NextResponse.json({ error: 'Model did not return a function call' }, { status: 500 })
    }

    const { name, args } = functionCallPart.functionCall
    const action = name as RoutedAction

    let result: RoutePromptResponse

    if (action === 'edit_manifest') {
      result = {
        action: 'edit_manifest',
        mutations: (args?.mutations as ManifestMutation[]) || [],
        message: (args?.message as string) || 'Timeline updated.',
      }
    } else if (action === 'split_at_marks') {
      result = {
        action: 'split_at_marks',
        splits: (args?.splits as SplitInstruction[]) || [],
        message: (args?.message as string) || 'Items split at mark positions.',
      }
    } else if (action === 'add_text') {
      result = {
        action: 'add_text',
        newTexts: (args?.texts as AddTextInstruction[]) || [],
        message: (args?.message as string) || 'Text added.',
      }
    } else if (action === 'replace_images') {
      result = {
        action: 'replace_images',
        replacements: (args?.replacements as ReplaceInstruction[]) || [],
        message: (args?.message as string) || 'Images replaced.',
      }
    } else {
      result = {
        action: 'no_op',
        message: (args?.reason as string) || 'I can only help with editing the timeline.',
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
