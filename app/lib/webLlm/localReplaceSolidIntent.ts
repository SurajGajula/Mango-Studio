import type { SolidColorReplaceInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { isAddSolidSpanPrompt } from '@/app/lib/webLlm/localAddSolidImageIntent'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import { resolvePromptItemNumbers } from '@/app/lib/webLlm/parsePromptManifestFilter'
import {
  normalizeSolidColorPrompt,
  parseSolidColorFromPrompt,
  solidColorLabel,
} from '@/app/lib/webLlm/localSolidColorUtils'

type ReplaceKind = 'image' | 'video'

const KIND_ALIASES: Record<ReplaceKind, string[]> = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
}

function normalizePrompt(prompt: string): string {
  return normalizeSolidColorPrompt(prompt)
}

function parseSolidColor(prompt: string): string | null {
  return parseSolidColorFromPrompt(prompt)
}

function detectReplaceKind(prompt: string): ReplaceKind | null {
  const normalized = normalizePrompt(prompt)
  const hasImage = new RegExp(`\\b(?:${KIND_ALIASES.image.join('|')})\\b`, 'i').test(normalized)
  const hasVideo = new RegExp(`\\b(?:${KIND_ALIASES.video.join('|')})\\b`, 'i').test(normalized)
  if (hasImage && !hasVideo) {
    return 'image'
  }
  if (hasVideo && !hasImage) {
    return 'video'
  }
  return null
}

function isReplacePrompt(prompt: string): boolean {
  if (isAddSolidSpanPrompt(prompt)) {
    return false
  }
  const normalized = normalizePrompt(prompt)
  if (/\b(?:replace|swap|substitute|change)\b/.test(normalized)) {
    return true
  }
  if (/\bmake\b/.test(normalized) && parseSolidColor(prompt)) {
    return /\b(?:image|images|video|videos|clip|clips|photo|photos|picture|pictures)\b/.test(
      normalized
    )
  }
  return false
}

function isEveryOtherPattern(normalized: string): boolean {
  return /\b(?:every\s+other|every\s+2(?:nd)?|alternat(?:e|ing)(?:ly)?)\b/.test(normalized)
}

function isAllItemsPattern(normalized: string, kind: ReplaceKind): boolean {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(`\\ball\\s+(?:the\\s+)?(?:${aliases})\\b`, 'i').test(normalized)
}

function parseItemNumbers(normalized: string, kind: ReplaceKind): number[] | null {
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

function everyOtherNumbers(total: number): number[] {
  const numbers: number[] = []
  for (let n = 1; n <= total; n += 2) {
    numbers.push(n)
  }
  return numbers
}

function solidReplacementsForNumbers(
  ids: string[],
  itemNumbers: number[],
  color: string
): SolidColorReplaceInstruction[] {
  return itemNumbers
    .map((number) => ids[number - 1])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((targetId) => ({ targetId, color }))
}

function colorLabel(color: string): string {
  return solidColorLabel(color)
}

function itemNumbersForReplace(prompt: string, kind: ReplaceKind): number[] | null {
  const normalized = normalizePrompt(prompt)
  if (isEveryOtherPattern(normalized)) {
    return null
  }
  if (isAllItemsPattern(normalized, kind)) {
    return null
  }

  const section = kind === 'image' ? 'image' : 'video'
  const resolved = resolvePromptItemNumbers(prompt, section)
  if (resolved === 'all') {
    return null
  }
  if (resolved && resolved.length > 0) {
    return resolved
  }
  return parseItemNumbers(normalized, kind)
}

export function resolveLocalReplaceSolidIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  if (!isReplacePrompt(prompt)) {
    return null
  }

  const color = parseSolidColor(prompt)
  if (!color) {
    return null
  }

  const kind = detectReplaceKind(prompt)
  if (!kind) {
    return null
  }

  const index = indexLocalManifest(manifest)
  const ids = idsForKind(index, kind)
  if (ids.length === 0) {
    return {
      action: 'no_op',
      message: `There are no ${kind} items on the timeline to replace.`,
    }
  }

  const normalized = normalizePrompt(prompt)
  let itemNumbers: number[] | null = null

  if (isEveryOtherPattern(normalized)) {
    itemNumbers = everyOtherNumbers(ids.length)
  } else if (isAllItemsPattern(normalized, kind)) {
    itemNumbers = ids.map((_, i) => i + 1)
  } else {
    itemNumbers = itemNumbersForReplace(prompt, kind)
  }

  if (itemNumbers === null) {
    return null
  }

  if (itemNumbers.length === 0) {
    return {
      action: 'no_op',
      message: `Could not determine which ${kind} items to replace.`,
    }
  }

  const solidReplacements = solidReplacementsForNumbers(ids, itemNumbers, color)
  if (solidReplacements.length === 0) {
    return {
      action: 'no_op',
      message: `Could not find the requested ${kind} item numbers on the timeline.`,
    }
  }

  const label = colorLabel(color)
  const kindLabel = kind === 'image' ? 'image' : 'video'
  const message =
    solidReplacements.length === 1
      ? `Replaced ${kindLabel} #${itemNumbers[0]} with ${label}.`
      : `Replaced ${solidReplacements.length} ${kindLabel}(s) with ${label}.`

  return {
    action: 'replace_with_solid',
    solidReplacements,
    message,
  }
}

export function localReplaceSolidIntentMismatch(
  prompt: string,
  response: LocalRoutePromptResponse,
  manifest: LocalChatManifest
): string | null {
  if (isAddSolidSpanPrompt(prompt)) {
    return null
  }
  if (response.action !== 'replace_with_solid') {
    return null
  }

  const expected = resolveLocalReplaceSolidIntent(prompt, manifest)
  if (!expected?.solidReplacements || expected.solidReplacements.length <= 1) {
    return null
  }

  const actual = response.solidReplacements ?? []
  if (actual.length >= expected.solidReplacements.length) {
    return null
  }

  return `Expected ${expected.solidReplacements.length} solid replacements but got ${actual.length}.`
}
