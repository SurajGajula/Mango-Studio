import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { tools, systemInstruction, FunctionCallingConfigMode } from '@/app/lib/routePromptConfig'

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
  animation?: string
  transition?: string
  zoomIntensity?: number
  transitionDuration?: number
  animationDuration?: number
  cropAspect?: string
  originalDuration?: number
  trimStart?: number
  trimEnd?: number
  playbackSpeed?: number
  muted?: boolean
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
  trimStart?: number
  trimEnd?: number
  playbackSpeed?: number
  muted?: boolean
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

export interface TransitionInstruction {
  type: 'image' | 'video'
  id: string
  animation?: 'none' | 'in' | 'out' | 'shake' | 'jitter'
  transition?: 'none' | 'split-horizontal' | 'split-vertical' | 'fade'
  zoomIntensity?: number
  transitionDuration?: number
  animationDuration?: number
}

export interface CropInstruction {
  type: 'image' | 'video'
  id: string
  cropAspect: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'none'
}

type RoutedAction = 'no_op' | 'edit_manifest' | 'split_at_marks' | 'replace_images' | 'add_text' | 'set_transitions' | 'set_crop'

interface RoutePromptResponse {
  action: RoutedAction
  mutations?: ManifestMutation[]
  splits?: SplitInstruction[]
  replacements?: ReplaceInstruction[]
  newTexts?: AddTextInstruction[]
  transitions?: TransitionInstruction[]
  crops?: CropInstruction[]
  message: string
}


function buildUploadedFilesContext(files: UploadedFileMeta[]): string {
  const lines = [`Attached files (${files.length}):`]
  for (const f of files) {
    lines.push(`  - index=${f.index} name="${f.name}"`)
  }
  return lines.join('\n')
}

function buildManifestContext(manifest: SerializedManifest): string {
  const lines: string[] = ['Current timeline contents:']
  lines.push('Item numbers reflect order by start time (e.g. "image 1" = earliest image on the timeline).')

  if (manifest.images?.length) {
    const sorted = [...manifest.images].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Images (${sorted.length}):`)
    sorted.forEach((img, i) => {
      lines.push(`  - #${i + 1} id="${img.id}" name="${img.name}" startTime=${img.startTime}s endTime=${img.endTime}s animation=${img.animation ?? 'none'} transition=${img.transition ?? 'none'}${img.zoomIntensity ? ` zoomIntensity=${img.zoomIntensity}` : ''}${img.transitionDuration ? ` transitionDuration=${img.transitionDuration}s` : ''}${img.animationDuration ? ` animationDuration=${img.animationDuration}s` : ''} cropAspect=${img.cropAspect ?? 'none'}`)
    })
  }
  if (manifest.videos?.length) {
    const sorted = [...manifest.videos].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    lines.push(`Videos (${sorted.length}):`)
    sorted.forEach((vid, i) => {
      lines.push(`  - #${i + 1} id="${vid.id}" title="${vid.title}" timestamp=${vid.timestamp}s duration=${vid.duration}s playbackSpeed=${vid.playbackSpeed ?? 1}x muted=${vid.muted ?? false} isOverlay=${vid.isOverlay} animation=${vid.animation ?? 'none'} transition=${vid.transition ?? 'none'}${vid.zoomIntensity ? ` zoomIntensity=${vid.zoomIntensity}` : ''}${vid.transitionDuration ? ` transitionDuration=${vid.transitionDuration}s` : ''}${vid.animationDuration ? ` animationDuration=${vid.animationDuration}s` : ''} cropAspect=${vid.cropAspect ?? 'none'}`)
    })
  }
  if (manifest.texts?.length) {
    const sorted = [...manifest.texts].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Texts (${sorted.length}):`)
    sorted.forEach((txt, i) => {
      lines.push(`  - #${i + 1} id="${txt.id}" content="${txt.content}" startTime=${txt.startTime}s endTime=${txt.endTime}s`)
    })
  }
  if (manifest.audios?.length) {
    const sorted = [...manifest.audios].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Audios (${sorted.length}):`)
    sorted.forEach((aud, i) => {
      const markStr = aud.marks?.length ? aud.marks.map((m) => `${m.toFixed(3)}s`).join(', ') : 'none'
      const origDur = aud.originalDuration ?? aud.endTime ?? 0
      const ts = aud.trimStart ?? 0
      const te = aud.trimEnd ?? 0
      const activeDur = Math.max(0, origDur - ts - te)
      lines.push(`  - #${i + 1} id="${aud.id}" name="${aud.name}" activeStartTime=${aud.startTime}s originalDuration=${origDur}s trimStart=${ts}s trimEnd=${te}s playbackSpeed=${aud.playbackSpeed ?? 1}x activeDuration=${activeDur.toFixed(3)}s (to restore to originalDuration set trimStart=0 trimEnd=0) marks=[${markStr}]`)
    })
  }

  if (lines.length === 2) lines.push('  (empty — no items yet)')

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: RoutePromptRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const manifestContext = body.manifest ? '\n\n' + buildManifestContext(body.manifest) : ''
    const filesContext = body.uploadedFiles?.length ? '\n\n' + buildUploadedFilesContext(body.uploadedFiles) : ''

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
            allowedFunctionNames: ['no_op', 'edit_manifest', 'split_at_marks', 'replace_images', 'add_text', 'set_transitions', 'set_crop'],
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
    } else if (action === 'set_transitions') {
      result = {
        action: 'set_transitions',
        transitions: (args?.transitions as TransitionInstruction[]) || [],
        message: (args?.message as string) || 'Transitions updated.',
      }
    } else if (action === 'set_crop') {
      result = {
        action: 'set_crop',
        crops: (args?.crops as CropInstruction[]) || [],
        message: (args?.message as string) || 'Aspect ratios updated.',
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
