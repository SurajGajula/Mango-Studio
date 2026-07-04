import type { TransitionInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import {
  normalizeLocalPrompt,
  promptIsTransitionRemoval,
} from '@/app/lib/webLlm/localTransitionPrompt'
import { parseSolidColorFromPrompt } from '@/app/lib/webLlm/localSolidColorUtils'

const TRANSITION_NAMES = ['fade', 'wipe', 'morph', 'split', 'slide-in', 'circle', 'rotate', 'flash'] as const

type TransitionName = (typeof TRANSITION_NAMES)[number]

const KIND_ALIASES = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
} as const

type TransitionParams = {
  transitionDuration?: number
  transitionColor?: string
  transitionFlashMode?: 'solid' | 'negative'
}

function parseTransitionName(normalized: string): TransitionName | null {
  const ordered: TransitionName[] = [
    'slide-in',
    'flash',
    'fade',
    'wipe',
    'morph',
    'circle',
    'rotate',
    'split',
  ]
  for (const name of ordered) {
    if (name === 'split') {
      if (
        /\b(?:split\s+transitions?|transitions?\s+(?:to\s+)?split)\b/.test(normalized) &&
        !/\bsplit\s+(?:image|images|video|videos|text|texts|audio|audios)\b/.test(normalized)
      ) {
        return 'split'
      }
      continue
    }
    if (new RegExp(`\\b${name.replace('-', '\\-')}\\b`).test(normalized)) {
      return name
    }
  }
  return null
}

function isAddTransitionPrompt(normalized: string): boolean {
  if (!/\b(?:add|apply|set|make|change|update)\b/.test(normalized)) {
    return false
  }
  return /\b(?:transitions?|fade|wipe|morph|flash|slide-in|circle|rotate)\b/.test(normalized) ||
    (/\bsplit\b/.test(normalized) && /\btransitions?\b/.test(normalized))
}

function isParameterOnlyPrompt(normalized: string): boolean {
  return (
    /\b(?:duration|length|color|negative|solid)\b/.test(normalized) &&
    /\b(?:transition|flash|fade|wipe|morph)\b/.test(normalized)
  )
}

function detectTransitionKind(normalized: string): 'image' | 'video' | null {
  const hasImage = new RegExp(`\\b(?:${KIND_ALIASES.image.join('|')})\\b`, 'i').test(normalized)
  const hasVideo = new RegExp(`\\b(?:${KIND_ALIASES.video.join('|')})\\b`, 'i').test(normalized)
  if (hasVideo && !hasImage) {
    return 'video'
  }
  if (hasImage && !hasVideo) {
    return 'image'
  }
  if (hasVideo) {
    return 'video'
  }
  return null
}

function isAllItemsPattern(normalized: string, kind: 'image' | 'video'): boolean {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(
    `\\b(?:all|every)\\s+(?:the\\s+)?(?:${aliases})\\b|\\bfrom\\s+(?:all|every)\\s+(?:the\\s+)?(?:${aliases})\\b`,
    'i'
  ).test(normalized)
}

function parseExceptNumbers(normalized: string, kind: 'image' | 'video'): number[] {
  const aliases = KIND_ALIASES[kind].join('|')
  const numbers: number[] = []
  const pattern = new RegExp(
    `\\b(?:except|excluding|but not|other than)(?:\\s+(?:for|on))?\\s+(?:the\\s+)?(?:${aliases})\\s*(\\d+)\\b`,
    'gi'
  )
  for (const match of normalized.matchAll(pattern)) {
    const itemNumber = Number.parseInt(match[1], 10)
    if (Number.isFinite(itemNumber) && itemNumber >= 1) {
      numbers.push(itemNumber)
    }
  }
  return numbers
}

function parseItemNumbers(normalized: string, kind: 'image' | 'video'): number[] | null {
  const aliases = KIND_ALIASES[kind].join('|')
  const rangeMatch = normalized.match(
    new RegExp(`\\b(?:${aliases})\\s*(\\d+)\\s*(?:-|–|to|through)\\s*(\\d+)\\b`, 'i')
  )
  if (rangeMatch) {
    const first = Number.parseInt(rangeMatch[1], 10)
    const last = Number.parseInt(rangeMatch[2], 10)
    if (!Number.isFinite(first) || !Number.isFinite(last) || first < 1 || last < first) {
      return []
    }
    const numbers: number[] = []
    for (let n = first; n <= last; n += 1) {
      numbers.push(n)
    }
    return numbers
  }

  const listMatch = normalized.match(
    new RegExp(`\\b(?:${aliases})\\s*((?:\\d+\\s*(?:,|and)\\s*)*\\d+)\\b`, 'i')
  )
  if (listMatch) {
    const numbers = listMatch[1]
      .split(/\s*(?:,|and)\s*/i)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value >= 1)
    return numbers.length > 0 ? numbers : []
  }

  const singleMatch = normalized.match(new RegExp(`\\b(?:${aliases})\\s*(\\d+)\\b`, 'i'))
  if (singleMatch) {
    const itemNumber = Number.parseInt(singleMatch[1], 10)
    if (!Number.isFinite(itemNumber) || itemNumber < 1) {
      return []
    }
    return [itemNumber]
  }

  return null
}

function parseTransitionParams(prompt: string, normalized: string): TransitionParams {
  const params: TransitionParams = {}

  const durationMatch = normalized.match(
    /\b(?:duration|length)\s*(?:of\s+)?(?:to\s+|of\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)?\b|\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b|\bfor\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)?\b/
  )
  if (durationMatch) {
    const raw = durationMatch[1] ?? durationMatch[2] ?? durationMatch[3]
    const duration = Number.parseFloat(raw)
    if (Number.isFinite(duration) && duration > 0) {
      params.transitionDuration = duration
    }
  }

  if (/\bnegative\b/.test(normalized)) {
    params.transitionFlashMode = 'negative'
  } else if (/\bsolid\s+(?:flash|color|mode)\b|\bflash\s+mode\s+solid\b|\bsolid\s+mode\b/.test(normalized)) {
    params.transitionFlashMode = 'solid'
  }

  const color = parseSolidColorFromPrompt(prompt)
  if (color && (/\bcolor\b/.test(normalized) || /\b(?:white|black|gray|grey|red|green|blue)\b/.test(normalized))) {
    params.transitionColor = color
  }

  return params
}

function transitionsForNumbers(
  kind: 'image' | 'video',
  ids: string[],
  itemNumbers: number[],
  transition: TransitionName | 'none' | undefined,
  params: TransitionParams
): TransitionInstruction[] {
  return itemNumbers
    .map((number) => ids[number - 1])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => {
      const instruction: TransitionInstruction = { type: kind, id }
      if (transition !== undefined) {
        instruction.transition = transition
      }
      if (params.transitionDuration !== undefined) {
        instruction.transitionDuration = params.transitionDuration
      }
      if (params.transitionColor !== undefined) {
        instruction.transitionColor = params.transitionColor
      }
      if (params.transitionFlashMode !== undefined) {
        instruction.transitionFlashMode = params.transitionFlashMode
      }
      return instruction
    })
}

function itemHasTransition(
  manifest: LocalChatManifest,
  kind: 'image' | 'video',
  itemNumber: number,
  transitionFilter: TransitionName | null
): boolean {
  const index = indexLocalManifest(manifest)
  const items = kind === 'image' ? index.images : index.videos
  const item = items[itemNumber - 1]
  if (!item) {
    return false
  }
  const current = item.transition ?? 'none'
  if (transitionFilter) {
    return current === transitionFilter
  }
  return current !== 'none'
}

function resolveRemovalTargets(
  prompt: string,
  manifest: LocalChatManifest,
  kind: 'image' | 'video',
  ids: string[]
): number[] {
  const normalized = normalizeLocalPrompt(prompt)
  const transitionFilter = parseTransitionName(normalized)
  const excluded = new Set(parseExceptNumbers(normalized, kind))

  let candidates: number[]
  if (isAllItemsPattern(normalized, kind)) {
    candidates = ids.map((_, index) => index + 1)
  } else {
    const parsed = parseItemNumbers(normalized, kind)
    candidates = parsed ?? ids.map((_, index) => index + 1)
  }

  return candidates.filter((number) => {
    if (excluded.has(number)) {
      return false
    }
    return itemHasTransition(manifest, kind, number, transitionFilter)
  })
}

function resolveAddTargets(normalized: string, kind: 'image' | 'video', ids: string[]): number[] | null {
  if (isAllItemsPattern(normalized, kind)) {
    return ids.map((_, index) => index + 1)
  }
  return parseItemNumbers(normalized, kind)
}

function instructionHasEditField(instruction: TransitionInstruction): boolean {
  return (
    instruction.transition !== undefined ||
    instruction.transitionDuration !== undefined ||
    instruction.transitionColor !== undefined ||
    instruction.transitionFlashMode !== undefined
  )
}

export function resolveLocalTransitionIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizeLocalPrompt(prompt)
  const isRemoval = promptIsTransitionRemoval(prompt)
  const isAdd = isAddTransitionPrompt(normalized)
  const isParams = isParameterOnlyPrompt(normalized)
  if (!isRemoval && !isAdd && !isParams) {
    return null
  }

  const kind = detectTransitionKind(normalized)
  if (!kind) {
    return null
  }

  const index = indexLocalManifest(manifest)
  const ids = idsForKind(index, kind)
  if (ids.length === 0) {
    return {
      action: 'no_op',
      message: `There are no ${kind} items on the timeline to update.`,
    }
  }

  const params = isRemoval ? {} : parseTransitionParams(prompt, normalized)
  const namedTransition = parseTransitionName(normalized)

  let transition: TransitionName | 'none' | undefined
  if (isRemoval) {
    transition = 'none'
  } else if (namedTransition) {
    transition = namedTransition
  } else if (isAdd) {
    transition = 'fade'
  } else {
    transition = undefined
  }

  if (!isRemoval && transition === undefined && Object.keys(params).length === 0) {
    return null
  }

  const itemNumbers = isRemoval
    ? resolveRemovalTargets(prompt, manifest, kind, ids)
    : resolveAddTargets(normalized, kind, ids)

  if (itemNumbers === null) {
    return null
  }

  if (itemNumbers.length === 0) {
    const filterLabel = isRemoval ? namedTransition ?? 'transition' : transition ?? 'transition'
    return {
      action: 'no_op',
      message: `No matching ${kind} items found for ${isRemoval ? 'removing' : 'setting'} ${filterLabel}.`,
    }
  }

  const transitions = transitionsForNumbers(kind, ids, itemNumbers, transition, params).filter(
    instructionHasEditField
  )
  if (transitions.length === 0) {
    return {
      action: 'no_op',
      message: `Could not find the requested ${kind} item numbers on the timeline.`,
    }
  }

  const kindLabel = kind === 'image' ? 'image' : 'video'
  const label = transition ?? namedTransition ?? 'transition'
  const message = isRemoval
    ? transitions.length === 1
      ? `Removed transition from ${kindLabel} #${itemNumbers[0]}.`
      : `Removed transitions from ${transitions.length} ${kindLabel}(s).`
    : transitions.length === 1
      ? `Set ${label} transition on ${kindLabel} #${itemNumbers[0]}.`
      : `Set ${label} transition on ${transitions.length} ${kindLabel}(s).`

  return {
    action: 'set_transitions',
    transitions,
    message,
  }
}
