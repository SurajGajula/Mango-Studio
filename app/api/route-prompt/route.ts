import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { getGenAIClient } from '@/app/lib/genaiClient'
import { audioMarksAbsoluteTimelinePositions } from '@/app/lib/audioMarkTimeline'
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
  marks?: Array<number | { t: number; id?: string }>
  animation?: string
  transition?: string
  zoomIntensity?: number
  zoomDistanceIntensity?: number
  transitionDuration?: number
  animationDuration?: number
  animationZoomEasing?: string
  transitionFlashMode?: 'solid' | 'negative'
  transitionWipeEasing?: 'ease-in' | 'ease-out' | 'linear'
  cropAspect?: string
  originalDuration?: number
  trimStart?: number
  trimEnd?: number
  playbackSpeed?: number
  speedStart?: number
  speedEnd?: number
  speedEasing?: 'linear' | 'ease'
  muted?: boolean
  volume?: number
  row?: number
  fontFamily?: string
  fontWeight?: string
  style?: string
}

interface SerializedManifest {
  images?: ManifestItem[]
  videos?: ManifestItem[]
  texts?: ManifestItem[]
  audios?: ManifestItem[]
  effects?: ManifestItem[]
}

interface UploadedFileMeta {
  index: number
  name: string
  type?: 'image' | 'audio' | 'video'
}

interface RoutePromptRequest {
  prompt: string
  manifest?: SerializedManifest
  uploadedFiles?: UploadedFileMeta[]
}

interface ZoomDistanceRangeDirective {
  zoomDistanceIntensity: number
  startImageNumber: number
  endImageNumber?: number
}

export interface ManifestMutation {
  type: 'updateImage' | 'updateVideo' | 'updateText' | 'updateAudio'
  id: string
  row?: number
  startTime?: number
  endTime?: number
  timestamp?: number
  duration?: number
  trimStart?: number
  trimEnd?: number
  playbackSpeed?: number
  speedStart?: number
  speedEnd?: number
  speedEasing?: 'linear' | 'ease'
  muted?: boolean
  fontFamily?: string
  fontWeight?: string
  animation?: 'none' | 'keyboard' | 'shake'
  style?: 'normal' | 'negative' | 'highlight'
}

export interface SplitInstruction {
  type: 'image' | 'video' | 'text'
  id: string
  times: number[]
}

export interface ReplaceInstruction {
  targetId: string
  fileIndex: number
}

export interface SolidColorReplaceInstruction {
  targetId: string
  color: string
}

export interface AddTextInstruction {
  content: string
  startTime: number
  endTime: number
}

export interface AddEffectInstruction {
  type: 'crt-dither' | 'flashing-black-vignette' | 'black-and-white' | 'vivid-sharp' | 'pixel-glitch-scan'
  startTime: number
  endTime: number
  intensity?: number
  contrast?: number
  flashSpeed?: number
}

export interface TransitionInstruction {
  type: 'image' | 'video'
  id: string
  animation?: 'none' | 'zoom-in' | 'zoom-out' | 'shake' | 'jitter' | 'slide-shake-left' | 'slide-shake-right' | string
  transition?: 'none' | 'split' | 'fade' | 'morph' | 'slide-in' | 'wipe' | 'circle' | 'rotate' | 'flash'
  zoomIntensity?: number
  zoomDistanceIntensity?: number
  transitionDuration?: number
  animationDuration?: number
  animationZoomEasing?: 'constant' | 'fast-slow' | 'slow-fast'
  transitionColor?: string
  transitionFlashMode?: 'solid' | 'negative'
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom' | 'up' | 'down'
  transitionAxis?: 'horizontal' | 'vertical'
  transitionSlideEasing?: 'smooth' | 'ease-in' | 'ease-out' | 'linear'
  transitionCircleEasing?: 'smooth' | 'ease-in' | 'ease-out' | 'linear'
  transitionWipeEasing?: 'ease-in' | 'ease-out' | 'linear'
}

export interface CropInstruction {
  type: 'image' | 'video'
  id: string
  cropAspect: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'none'
}

export interface StepGrowthInstruction {
  id?: string
  imageNumber?: number
  target?: 'image_id' | 'image_number' | 'selected'
  steps?: number
}

export interface NormalizeAudioVolumesInstruction {
  referenceAudioNumber: number
  targetAudioNumbers: number[]
}

export interface DeleteTimelineItemInstruction {
  type: 'image' | 'video' | 'text' | 'audio' | 'effect'
  id: string
}

type RoutedAction =
  | 'no_op'
  | 'edit_manifest'
  | 'split_at_marks'
  | 'replace_images'
  | 'replace_with_solid'
  | 'add_text'
  | 'set_transitions'
  | 'set_step_growth'
  | 'set_crop'
  | 'add_effect'
  | 'delete_timeline_items'
  | 'duplicate_timeline_range'
  | 'normalize_audio_volumes'

interface RoutePromptResponse {
  action: RoutedAction
  mutations?: ManifestMutation[]
  splits?: SplitInstruction[]
  replacements?: ReplaceInstruction[]
  solidReplacements?: SolidColorReplaceInstruction[]
  newTexts?: AddTextInstruction[]
  newEffects?: AddEffectInstruction[]
  transitions?: TransitionInstruction[]
  stepGrowth?: StepGrowthInstruction[]
  crops?: CropInstruction[]
  deleteItems?: DeleteTimelineItemInstruction[]
  duplicateRange?: { kind: 'image' | 'video'; firstNumber: number; lastNumber: number }
  normalizeAudioVolumes?: NormalizeAudioVolumesInstruction
  message: string
}


function buildUploadedFilesContext(files: UploadedFileMeta[]): string {
  const lines = [`Attached files (${files.length}):`]
  for (const f of files) {
    lines.push(`  - index=${f.index} type=${f.type ?? 'image'} name="${f.name}"`)
  }
  return lines.join('\n')
}

function buildManifestContext(manifest: SerializedManifest): string {
  const lines: string[] = ['Current timeline contents:']
  lines.push('All item numbers are global across all rows, sorted by startTime (or timestamp for videos).')

  if (manifest.images?.length) {
    const sorted = [...manifest.images].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Images (${sorted.length}):`)
    sorted.forEach((img, i) => {
      const row = img.row ?? 0
      lines.push(`  - #${i + 1} row=${row} id="${img.id}" name="${img.name}" startTime=${img.startTime}s endTime=${img.endTime}s animation=${img.animation ?? 'none'} transition=${img.transition ?? 'none'}${img.zoomIntensity ? ` zoomIntensity=${img.zoomIntensity}` : ''}${img.zoomDistanceIntensity ? ` zoomDistanceIntensity=${img.zoomDistanceIntensity}` : ''}${img.transitionDuration ? ` transitionDuration=${img.transitionDuration}s` : ''}${img.animationDuration ? ` animationDuration=${img.animationDuration}s` : ''}${img.animationZoomEasing ? ` animationZoomEasing=${img.animationZoomEasing}` : ''}${img.transitionWipeEasing ? ` transitionWipeEasing=${img.transitionWipeEasing}` : ''} cropAspect=${img.cropAspect ?? 'none'}`)
    })
  }
  if (manifest.videos?.length) {
    const sorted = [...manifest.videos].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    lines.push(`Videos (${sorted.length}):`)
    sorted.forEach((vid, i) => {
      const speedStr = vid.speedStart !== undefined && vid.speedEnd !== undefined && vid.speedStart !== vid.speedEnd
        ? `speedStart=${vid.speedStart}x speedEnd=${vid.speedEnd}x easing=${vid.speedEasing ?? 'linear'}`
        : `playbackSpeed=${vid.playbackSpeed ?? 1}x`
      lines.push(`  - #${i + 1} id="${vid.id}" title="${vid.title}" timestamp=${vid.timestamp}s duration=${vid.duration}s ${speedStr} muted=${vid.muted ?? false} row=${vid.row ?? 0} animation=${vid.animation ?? 'none'} transition=${vid.transition ?? 'none'}${vid.zoomIntensity ? ` zoomIntensity=${vid.zoomIntensity}` : ''}${vid.zoomDistanceIntensity ? ` zoomDistanceIntensity=${vid.zoomDistanceIntensity}` : ''}${vid.transitionDuration ? ` transitionDuration=${vid.transitionDuration}s` : ''}${vid.animationDuration ? ` animationDuration=${vid.animationDuration}s` : ''}${vid.animationZoomEasing ? ` animationZoomEasing=${vid.animationZoomEasing}` : ''}${vid.transitionWipeEasing ? ` transitionWipeEasing=${vid.transitionWipeEasing}` : ''} cropAspect=${vid.cropAspect ?? 'none'}`)
    })
  }
  if (manifest.texts?.length) {
    const sorted = [...manifest.texts].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Texts (${sorted.length}):`)
    sorted.forEach((txt, i) => {
      lines.push(
        `  - #${i + 1} id="${txt.id}" content="${txt.content}" startTime=${txt.startTime}s endTime=${txt.endTime}s fontFamily="${txt.fontFamily ?? 'Inter, sans-serif'}" fontWeight="${txt.fontWeight ?? '600'}" animation=${txt.animation ?? 'none'} style=${txt.style ?? 'normal'}`
      )
    })
  }
  if (manifest.audios?.length) {
    const sorted = [...manifest.audios].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Audios (${sorted.length}):`)
    sorted.forEach((aud, i) => {
      const origDur = aud.originalDuration ?? aud.endTime ?? 0
      const ts = aud.trimStart ?? 0
      const te = aud.trimEnd ?? 0
      const sourceTimes = (aud.marks ?? []).map((m) => (typeof m === 'number' ? m : m.t))
      const markStr = sourceTimes.length ? sourceTimes.map((t) => `${t.toFixed(3)}s`).join(', ') : 'none'
      const timelineSplits = audioMarksAbsoluteTimelinePositions(
        aud.startTime ?? 0,
        ts,
        te,
        origDur,
        sourceTimes
      )
      const timelineSplitStr = timelineSplits.length ? timelineSplits.map((t) => `${t.toFixed(3)}s`).join(', ') : 'none'
      const activeDur = Math.max(0, origDur - ts - te)
      const vol = aud.volume ?? 1
      lines.push(
        `  - #${i + 1} id="${aud.id}" name="${aud.name}" activeStartTime=${aud.startTime}s originalDuration=${origDur}s trimStart=${ts}s trimEnd=${te}s volume=${vol} (timeline gain 0–4; perceived loudness also depends on the file) playbackSpeed=${aud.playbackSpeed ?? 1}x activeDuration=${activeDur.toFixed(3)}s (to restore to originalDuration set trimStart=0 trimEnd=0) marksSourceFileSeconds=[${markStr}] splitAtMarksTimelineSeconds=[${timelineSplitStr}] (marksSourceFileSeconds are positions in the original audio file; splitAtMarksTimelineSeconds are the absolute timeline times to use in split_at_marks)`
      )
    })
  }
  if (manifest.effects?.length) {
    const sorted = [...manifest.effects].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Effects (${sorted.length}):`)
    sorted.forEach((effect, i) => {
      lines.push(
        `  - #${i + 1} id="${effect.id}" type="${effect.name ?? 'unknown'}" startTime=${effect.startTime}s endTime=${effect.endTime}s`
      )
    })
  }

  if (lines.length === 2) lines.push('  (empty — no items yet)')

  return lines.join('\n')
}

function parseZoomDistanceRangeDirective(prompt: string): ZoomDistanceRangeDirective | null {
  const normalized = prompt.toLowerCase()
  if (!normalized.includes('zoom')) return null
  if (!normalized.includes('distance')) return null

  const explicitIntensityMatch = normalized.match(/zoomdistanceintensity\s*(?:to|=)?\s*(\d*\.?\d+)/)
  const xMatches = Array.from(normalized.matchAll(/(\d*\.?\d+)\s*x\b/g))
  const trailingXMatch = xMatches.length > 0 ? xMatches[xMatches.length - 1] : null
  const zoomDistanceMatch = explicitIntensityMatch ?? trailingXMatch
  if (!zoomDistanceMatch) return null
  const parsedIntensity = Number.parseFloat(zoomDistanceMatch[1])
  if (!Number.isFinite(parsedIntensity)) return null

  const rangeMatch = normalized.match(/images?\s*#?\s*(\d+)\s*(?:through|thru|to|-|–|—)\s*#?\s*(\d+)/)
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10)
    const end = Number.parseInt(rangeMatch[2], 10)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    return {
      zoomDistanceIntensity: parsedIntensity,
      startImageNumber: Math.min(start, end),
      endImageNumber: Math.max(start, end),
    }
  }

  const onwardMatch = normalized.match(/images?\s*#?\s*(\d+)\s*(?:onward|onwards|and onward|and onwards)/)
  if (onwardMatch) {
    const start = Number.parseInt(onwardMatch[1], 10)
    if (!Number.isFinite(start)) return null
    return {
      zoomDistanceIntensity: parsedIntensity,
      startImageNumber: start,
    }
  }

  return null
}

function enforcePromptZoomDistanceDirective(
  transitions: TransitionInstruction[],
  manifest: SerializedManifest | undefined,
  prompt: string
): TransitionInstruction[] {
  if (!manifest?.images?.length || transitions.length === 0) return transitions

  const directive = parseZoomDistanceRangeDirective(prompt)
  if (!directive) return transitions

  const sortedImages = [...manifest.images].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  const maxImageNumber = sortedImages.length
  const start = Math.max(1, directive.startImageNumber)
  const end = Math.max(start, Math.min(directive.endImageNumber ?? maxImageNumber, maxImageNumber))

  const targetIds = new Set(
    sortedImages
      .slice(start - 1, end)
      .map((img) => img.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )
  if (targetIds.size === 0) return transitions

  const seenTargetIds = new Set<string>()
  const normalizedTransitions = transitions.map((transition) => {
    if (transition.type === 'image' && targetIds.has(transition.id)) {
      seenTargetIds.add(transition.id)
      return { ...transition, zoomDistanceIntensity: directive.zoomDistanceIntensity }
    }
    return transition
  })

  for (const imageId of targetIds) {
    if (!seenTargetIds.has(imageId)) {
      normalizedTransitions.push({
        type: 'image',
        id: imageId,
        zoomDistanceIntensity: directive.zoomDistanceIntensity,
      })
    }
  }

  return normalizedTransitions
}

function buildZoomDistanceTransitionsFromPrompt(
  manifest: SerializedManifest | undefined,
  prompt: string
): TransitionInstruction[] {
  if (!manifest?.images?.length) return []
  const directive = parseZoomDistanceRangeDirective(prompt)
  if (!directive) return []

  const sortedImages = [...manifest.images].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  const maxImageNumber = sortedImages.length
  const start = Math.max(1, directive.startImageNumber)
  const end = Math.max(start, Math.min(directive.endImageNumber ?? maxImageNumber, maxImageNumber))

  return sortedImages
    .slice(start - 1, end)
    .filter((img): img is ManifestItem & { id: string } => typeof img.id === 'string' && img.id.length > 0)
    .map((img) => ({
      type: 'image',
      id: img.id,
      zoomDistanceIntensity: directive.zoomDistanceIntensity,
    }))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check request limits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro, requests_remaining')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 })
    }

    if (profile.requests_remaining <= 0) {
      return NextResponse.json({ 
        error: profile.is_pro 
          ? 'Pro request limit reached (1000). Please contact support for more.' 
          : 'Request limit reached. Please upgrade to Pro for more requests.',
        limitReached: true 
      }, { status: 403 })
    }

    const body: RoutePromptRequest = await request.json()

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const ai = getGenAIClient()
    const manifestContext = body.manifest ? '\n\n' + buildManifestContext(body.manifest) : ''
    const filesContext = body.uploadedFiles?.length ? '\n\n' + buildUploadedFilesContext(body.uploadedFiles) : ''

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
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
            allowedFunctionNames: [
              'no_op',
              'edit_manifest',
              'delete_timeline_items',
              'duplicate_timeline_range',
              'split_at_marks',
              'replace_images',
              'replace_with_solid',
              'add_text',
              'set_transitions',
              'set_step_growth',
              'set_crop',
              'add_effect',
              'normalize_audio_volumes',
            ],
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

    // Decrement request count
    await supabase
      .from('profiles')
      .update({ requests_remaining: profile.requests_remaining - 1 })
      .eq('id', user.id)

    let result: RoutePromptResponse

    if (action === 'edit_manifest') {
      const forcedTransitions = buildZoomDistanceTransitionsFromPrompt(body.manifest, body.prompt)
      if (forcedTransitions.length > 0) {
        result = {
          action: 'set_transitions',
          transitions: forcedTransitions,
          message: 'Zoom distance updated for requested image range.',
        }
      } else {
      result = {
        action: 'edit_manifest',
        mutations: (args?.mutations as ManifestMutation[]) || [],
        message: (args?.message as string) || 'Timeline updated.',
      }
      }
    } else if (action === 'delete_timeline_items') {
      result = {
        action: 'delete_timeline_items',
        deleteItems: (args?.items as DeleteTimelineItemInstruction[]) || [],
        message: (args?.message as string) || 'Items removed.',
      }
    } else if (action === 'duplicate_timeline_range') {
      const kind = args?.kind === 'video' ? 'video' : 'image'
      const firstNumber = typeof args?.firstNumber === 'number' ? args.firstNumber : 1
      const lastNumber = typeof args?.lastNumber === 'number' ? args.lastNumber : firstNumber
      result = {
        action: 'duplicate_timeline_range',
        duplicateRange: { kind, firstNumber, lastNumber },
        message: (args?.message as string) || 'Range duplicated.',
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
    } else if (action === 'replace_with_solid') {
      result = {
        action: 'replace_with_solid',
        solidReplacements: (args?.replacements as SolidColorReplaceInstruction[]) || [],
        message: (args?.message as string) || 'Replaced with solid color.',
      }
    } else if (action === 'set_transitions') {
      const modelTransitions = (args?.transitions as TransitionInstruction[]) || []
      result = {
        action: 'set_transitions',
        transitions: enforcePromptZoomDistanceDirective(modelTransitions, body.manifest, body.prompt),
        message: (args?.message as string) || 'Transitions updated.',
      }
    } else if (action === 'set_step_growth') {
      result = {
        action: 'set_step_growth',
        stepGrowth: (args?.grows as StepGrowthInstruction[]) || [],
        message: (args?.message as string) || 'Step growth applied.',
      }
    } else if (action === 'set_crop') {
      result = {
        action: 'set_crop',
        crops: (args?.crops as CropInstruction[]) || [],
        message: (args?.message as string) || 'Aspect ratios updated.',
      }
    } else if (action === 'add_effect') {
      result = {
        action: 'add_effect',
        newEffects: (args?.effects as AddEffectInstruction[]) || [],
        message: (args?.message as string) || 'Effect(s) added.',
      }
    } else if (action === 'normalize_audio_volumes') {
      const referenceAudioNumber =
        typeof args?.referenceAudioNumber === 'number' ? args.referenceAudioNumber : 1
      const rawTargets = Array.isArray(args?.targetAudioNumbers) ? args.targetAudioNumbers : []
      const targetAudioNumbers = rawTargets.filter((n: unknown): n is number => typeof n === 'number')
      result = {
        action: 'normalize_audio_volumes',
        normalizeAudioVolumes: { referenceAudioNumber, targetAudioNumbers },
        message: (args?.message as string) || 'Audio levels matched to reference.',
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
