import type { TransitionInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import { resolvePromptItemNumbers } from '@/app/lib/webLlm/parsePromptManifestFilter'
import { normalizeLocalPrompt } from '@/app/lib/webLlm/localTransitionPrompt'

const ANIMATION_NAMES = [
  'slide-shake-left',
  'slide-shake-right',
  'zoom-in',
  'zoom-out',
  'stretch-out',
  'shake',
  'jitter',
  'rotate',
] as const

type AnimationName = (typeof ANIMATION_NAMES)[number]

const KIND_ALIASES = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
} as const

function detectKind(normalized: string): 'image' | 'video' | null {
  const hasImage = new RegExp(`\\b(?:${KIND_ALIASES.image.join('|')})\\b`, 'i').test(normalized)
  const hasVideo = new RegExp(`\\b(?:${KIND_ALIASES.video.join('|')})\\b`, 'i').test(normalized)
  if (hasVideo && !hasImage) return 'video'
  if (hasImage && !hasVideo) return 'image'
  return null
}

function parseAnimationName(normalized: string): AnimationName | null {
  if (/\bzoom\s*-?\s*in\b/.test(normalized) || /\bzoom in\b/.test(normalized)) return 'zoom-in'
  if (/\bzoom\s*-?\s*out\b/.test(normalized) || /\bzoom out\b/.test(normalized)) return 'zoom-out'
  if (/\bstretch\s*-?\s*out\b/.test(normalized) || /\bstretch out\b/.test(normalized)) return 'stretch-out'
  if (/\bslide\s*-?\s*shake\s*-?\s*left\b/.test(normalized) || /\bslide shake from left\b/.test(normalized)) {
    return 'slide-shake-left'
  }
  if (/\bslide\s*-?\s*shake\s*-?\s*right\b/.test(normalized) || /\bslide shake from right\b/.test(normalized)) {
    return 'slide-shake-right'
  }
  for (const name of ANIMATION_NAMES) {
    if (normalized.includes(name)) {
      return name
    }
  }
  if (/\bshake\b/.test(normalized)) return 'shake'
  if (/\bjitter\b/.test(normalized)) return 'jitter'
  if (/\brotate\b/.test(normalized) && !/\btransition\b/.test(normalized)) return 'rotate'
  return null
}

function parseItemNumber(normalized: string, kind: 'image' | 'video'): number | null {
  const aliases = KIND_ALIASES[kind].join('|')
  const match = normalized.match(new RegExp(`\\b(?:${aliases})\\s*(\\d+)\\b`, 'i'))
  if (!match) return null
  const itemNumber = Number.parseInt(match[1], 10)
  return Number.isFinite(itemNumber) && itemNumber >= 1 ? itemNumber : null
}

function isAllItemsPattern(normalized: string, kind: 'image' | 'video'): boolean {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(`\\b(?:all|every)\\s+(?:the\\s+)?(?:${aliases})\\b`, 'i').test(normalized)
}

function parseIntensityValue(raw: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) {
    return 0.5
  }
  if (value > 1 && value <= 100) {
    return value / 100
  }
  return value
}

function instructionForItem(
  kind: 'image' | 'video',
  id: string,
  fields: Omit<TransitionInstruction, 'type' | 'id'>
): TransitionInstruction {
  return { type: kind, id, ...fields }
}

export function promptIsAnimationPropertyEdit(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  return (
    /\banimation\s+duration\b/.test(normalized) ||
    /\btransition\s+duration\b/.test(normalized) ||
    /\b(?:shake|zoom|animation)\s+intensity\b/.test(normalized) ||
    /\bintensity\s+to\b/.test(normalized)
  )
}

export function promptIsAnimationRemoval(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  if (!/\b(?:remove|clear|delete|strip)\b/.test(normalized)) {
    return false
  }
  if (/\btransitions?\b/.test(normalized) && /\b(?:fade|flash|wipe|morph|split)\b/.test(normalized)) {
    return false
  }
  return /\banimations?\b/.test(normalized)
}

export function promptIsAnimationAdd(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  if (!/\b(?:add|apply|set)\b/.test(normalized)) {
    return false
  }
  if (promptIsAnimationPropertyEdit(prompt)) {
    return false
  }
  return parseAnimationName(normalized) !== null
}

function resolvePropertyEdit(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizeLocalPrompt(prompt)
  const kind = detectKind(normalized)
  if (!kind) {
    return null
  }

  const animationDurationMatch = normalized.match(
    /\b(?:set\s+)?(?:the\s+)?(?:image|video)\s+(\d+)\s+animation\s+duration\s+to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/
  )
  if (animationDurationMatch) {
    const itemNumber = Number.parseInt(animationDurationMatch[1], 10)
    const seconds = Number.parseFloat(animationDurationMatch[2])
    const id = idsForKind(indexLocalManifest(manifest), kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    return {
      action: 'set_transitions',
      transitions: [instructionForItem(kind, id, { animationDuration: seconds })],
      message: `Set ${kind} #${itemNumber} animation duration to ${seconds}s.`,
    }
  }

  const transitionDurationMatch = normalized.match(
    /\b(?:set\s+)?(?:the\s+)?(?:image|video)\s+(\d+)\s+transition\s+duration\s+to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/
  )
  if (transitionDurationMatch) {
    const itemNumber = Number.parseInt(transitionDurationMatch[1], 10)
    const seconds = Number.parseFloat(transitionDurationMatch[2])
    const id = idsForKind(indexLocalManifest(manifest), kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    return {
      action: 'set_transitions',
      transitions: [instructionForItem(kind, id, { transitionDuration: seconds })],
      message: `Set ${kind} #${itemNumber} transition duration to ${seconds}s.`,
    }
  }

  const intensityMatch = normalized.match(
    /\b(?:set\s+)?(?:the\s+)?(?:image|video)\s+(\d+)\s+(?:(shake|zoom|animation)\s+)?intensity\s+to\s+(\d+(?:\.\d+)?)\s*%?\b/
  )
  if (intensityMatch) {
    const itemNumber = Number.parseInt(intensityMatch[1], 10)
    const intensity = parseIntensityValue(intensityMatch[3])
    const id = idsForKind(indexLocalManifest(manifest), kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    return {
      action: 'set_transitions',
      transitions: [instructionForItem(kind, id, { zoomIntensity: intensity })],
      message: `Set ${kind} #${itemNumber} animation intensity to ${intensity}.`,
    }
  }

  return null
}

export function resolveLocalAnimationIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizeLocalPrompt(prompt)
  const propertyEdit = resolvePropertyEdit(prompt, manifest)
  if (propertyEdit) {
    return propertyEdit
  }

  const kind = detectKind(normalized)
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

  if (promptIsAnimationRemoval(prompt)) {
    let itemNumbers: number[]
    if (isAllItemsPattern(normalized, kind)) {
      itemNumbers = ids.map((_, i) => i + 1)
    } else {
      const single = parseItemNumber(normalized, kind)
      itemNumbers = single ? [single] : ids.map((_, i) => i + 1)
    }
    const transitions = itemNumbers
      .map((number) => ids[number - 1])
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map((id) => instructionForItem(kind, id, { animation: 'none' }))
    if (transitions.length === 0) {
      return { action: 'no_op', message: `Could not find ${kind} items to update.` }
    }
    return {
      action: 'set_transitions',
      transitions,
      message: `Removed animation from ${transitions.length} ${kind}(s).`,
    }
  }

  if (!promptIsAnimationAdd(prompt)) {
    return null
  }

  const animation = parseAnimationName(normalized)
  if (!animation) {
    return null
  }

  let itemNumbers: number[]
  if (isAllItemsPattern(normalized, kind)) {
    itemNumbers = ids.map((_, i) => i + 1)
  } else {
    const resolved = resolvePromptItemNumbers(prompt, kind)
    if (resolved === 'all') {
      itemNumbers = ids.map((_, i) => i + 1)
    } else if (resolved && resolved.length > 0) {
      itemNumbers = resolved
    } else {
      const single = parseItemNumber(normalized, kind)
      if (!single) {
        return null
      }
      itemNumbers = [single]
    }
  }

  const transitions = itemNumbers
    .map((number) => ids[number - 1])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => instructionForItem(kind, id, { animation }))

  if (transitions.length === 0) {
    return { action: 'no_op', message: `Could not find the requested ${kind} item numbers.` }
  }

  return {
    action: 'set_transitions',
    transitions,
    message:
      transitions.length === 1
        ? `Set ${animation} animation on ${kind} #${itemNumbers[0]}.`
        : `Set ${animation} animation on ${transitions.length} ${kind}(s).`,
  }
}
