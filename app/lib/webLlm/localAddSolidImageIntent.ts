import type { AddSolidImageInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import { resolvePromptItemNumbers } from '@/app/lib/webLlm/parsePromptManifestFilter'
import {
  normalizeSolidColorPrompt,
  parseSolidColorFromPrompt,
  solidColorLabel,
} from '@/app/lib/webLlm/localSolidColorUtils'

type SpanKind = 'image' | 'video'

export function isAddSolidSpanPrompt(prompt: string): boolean {
  const normalized = normalizeSolidColorPrompt(prompt)
  if (!/\blength\s+of\b/.test(normalized)) {
    return false
  }
  if (!/\b(?:make|add|insert|place)\b/.test(normalized)) {
    return false
  }
  if (!parseSolidColorFromPrompt(prompt)) {
    return false
  }
  return /\b(?:image|images|video|videos)\b/.test(normalized)
}

function detectSpanKind(prompt: string): SpanKind | null {
  const normalized = normalizeSolidColorPrompt(prompt)
  const lengthOfMatch = normalized.match(/\blength\s+of\s+(?:the\s+)?(image|images|video|videos)\b/i)
  if (lengthOfMatch) {
    return lengthOfMatch[1].startsWith('video') ? 'video' : 'image'
  }

  const hasImage = /\b(?:image|images)\b/.test(normalized)
  const hasVideo = /\b(?:video|videos)\b/.test(normalized)
  if (hasImage && !hasVideo) {
    return 'image'
  }
  if (hasVideo && !hasImage) {
    return 'video'
  }
  return null
}

function spanItemNumbers(prompt: string, kind: SpanKind): number[] | null {
  const section = kind === 'image' ? 'image' : 'video'
  const resolved = resolvePromptItemNumbers(prompt, section)
  if (resolved === 'all' || !resolved || resolved.length === 0) {
    return null
  }
  return resolved
}

export function resolveLocalAddSolidImageIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  if (!isAddSolidSpanPrompt(prompt)) {
    return null
  }

  const color = parseSolidColorFromPrompt(prompt)
  if (!color) {
    return null
  }

  const kind = detectSpanKind(prompt)
  if (!kind) {
    return null
  }

  const index = indexLocalManifest(manifest)
  if (kind === 'image' && index.images.length === 0) {
    return {
      action: 'no_op',
      message: 'There are no image items on the timeline.',
    }
  }
  if (kind === 'video' && index.videos.length === 0) {
    return {
      action: 'no_op',
      message: 'There are no video items on the timeline.',
    }
  }

  const itemNumbers = spanItemNumbers(prompt, kind)
  if (!itemNumbers) {
    return {
      action: 'no_op',
      message: `Could not determine which ${kind} range to span.`,
    }
  }

  const firstNumber = Math.min(...itemNumbers)
  const lastNumber = Math.max(...itemNumbers)

  let startTime = 0
  let endTime = 0
  if (kind === 'image') {
    const firstItem = index.images[firstNumber - 1]
    const lastItem = index.images[lastNumber - 1]
    if (!firstItem || !lastItem) {
      return {
        action: 'no_op',
        message: `Could not find image #${firstNumber}–#${lastNumber} on the timeline.`,
      }
    }
    startTime = firstItem.startTime ?? 0
    endTime = lastItem.endTime ?? 0
  } else {
    const firstItem = index.videos[firstNumber - 1]
    const lastItem = index.videos[lastNumber - 1]
    if (!firstItem || !lastItem) {
      return {
        action: 'no_op',
        message: `Could not find video #${firstNumber}–#${lastNumber} on the timeline.`,
      }
    }
    startTime = firstItem.timestamp ?? 0
    endTime = (lastItem.timestamp ?? 0) + (lastItem.duration ?? 0)
  }

  if (endTime <= startTime) {
    return {
      action: 'no_op',
      message: 'Solid image end time must be after start time.',
    }
  }

  const label = solidColorLabel(color)
  const kindLabel = kind === 'image' ? 'image' : 'video'
  const newSolidImages: AddSolidImageInstruction[] = [{ color, startTime, endTime }]
  const message =
    firstNumber === lastNumber
      ? `Added ${label} image the length of ${kindLabel} #${firstNumber}.`
      : `Added ${label} image from ${kindLabel} #${firstNumber} to #${lastNumber}.`

  return {
    action: 'add_solid_image',
    newSolidImages,
    message,
  }
}

export function localAddSolidImageIntentMismatch(
  prompt: string,
  response: LocalRoutePromptResponse
): string | null {
  if (!isAddSolidSpanPrompt(prompt)) {
    return null
  }
  if (response.action === 'add_solid_image') {
    return null
  }
  if (response.action === 'replace_with_solid') {
    return 'Span prompts add one new solid clip across a range; use add_solid_image instead of replace_with_solid.'
  }
  return null
}
