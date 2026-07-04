import type { SplitInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import { resolvePromptItemNumbers } from '@/app/lib/webLlm/parsePromptManifestFilter'

type SplitKind = 'image' | 'video' | 'text' | 'audio'

const KIND_ALIASES: Record<SplitKind, string[]> = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
  text: ['text', 'texts', 'caption', 'captions', 'subtitle', 'subtitles'],
  audio: ['audio', 'audios', 'sound', 'sounds'],
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

function detectSplitKind(normalized: string): SplitKind | null {
  const kinds: SplitKind[] = ['image', 'video', 'text', 'audio']
  const matched = kinds.filter((kind) =>
    new RegExp(`\\b(?:${KIND_ALIASES[kind].join('|')})\\b`, 'i').test(normalized)
  )
  if (matched.length === 1) {
    return matched[0]
  }
  return null
}

function parseParts(normalized: string): number | null {
  if (/\bin\s+half\b/.test(normalized)) {
    return 2
  }
  const partsMatch = normalized.match(
    /\b(?:into|in|to)\s+(\d+)(?:\s+(?:equal\s+)?(?:parts?|pieces?|segments?))?\b/
  )
  if (!partsMatch) {
    return null
  }
  const parts = Number.parseInt(partsMatch[1], 10)
  if (!Number.isFinite(parts) || parts < 2) {
    return null
  }
  return parts
}

function itemNumbersForKind(
  prompt: string,
  kind: SplitKind,
  totalItems: number
): number[] | null {
  const resolved = resolvePromptItemNumbers(prompt, kind)
  if (resolved === 'all') {
    return totalItems > 0 ? Array.from({ length: totalItems }, (_, i) => i + 1) : []
  }
  if (resolved && resolved.length > 0) {
    return [...new Set(resolved)].sort((a, b) => a - b)
  }

  const aliases = KIND_ALIASES[kind].join('|')
  const normalized = normalizePrompt(prompt)
  const singleMatch = normalized.match(new RegExp(`\\b(?:${aliases})\\s*(\\d+)\\b`, 'i'))
  if (singleMatch) {
    const itemNumber = Number.parseInt(singleMatch[1], 10)
    if (Number.isFinite(itemNumber) && itemNumber >= 1) {
      return [itemNumber]
    }
  }
  return null
}

function splitTimesForItem(
  kind: SplitKind,
  index: ReturnType<typeof indexLocalManifest>,
  itemNumber: number,
  parts: number
): { id: string; times: number[] } | null {
  if (kind === 'image') {
    const item = index.images[itemNumber - 1]
    if (!item) return null
    const start = item.startTime ?? 0
    const end = item.endTime ?? 0
    const span = end - start
    if (!(span > 0)) return null
    const times = Array.from({ length: parts - 1 }, (_, i) => start + (span * (i + 1)) / parts)
    return { id: item.id, times }
  }
  if (kind === 'video') {
    const item = index.videos[itemNumber - 1]
    if (!item) return null
    const start = item.timestamp ?? 0
    const duration = item.duration ?? 0
    if (!(duration > 0)) return null
    const times = Array.from({ length: parts - 1 }, (_, i) => start + (duration * (i + 1)) / parts)
    return { id: item.id, times }
  }
  if (kind === 'text') {
    const item = index.texts[itemNumber - 1]
    if (!item) return null
    const start = item.startTime ?? 0
    const end = item.endTime ?? 0
    const span = end - start
    if (!(span > 0)) return null
    const times = Array.from({ length: parts - 1 }, (_, i) => start + (span * (i + 1)) / parts)
    return { id: item.id, times }
  }
  const item = index.audios[itemNumber - 1]
  if (!item) return null
  const start = item.startTime ?? 0
  const end = item.endTime ?? 0
  const span = end - start
  if (!(span > 0)) return null
  const times = Array.from({ length: parts - 1 }, (_, i) => start + (span * (i + 1)) / parts)
  return { id: item.id, times }
}

function totalForKind(index: ReturnType<typeof indexLocalManifest>, kind: SplitKind): number {
  if (kind === 'image') return index.images.length
  if (kind === 'video') return index.videos.length
  if (kind === 'text') return index.texts.length
  return index.audios.length
}

export function resolveLocalSplitIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  if (!/\bsplit\b/.test(normalized)) {
    return null
  }

  const kind = detectSplitKind(normalized)
  if (!kind) {
    return null
  }

  const parts = parseParts(normalized)
  if (parts === null) {
    return null
  }

  const index = indexLocalManifest(manifest)
  const totalItems = totalForKind(index, kind)
  if (totalItems === 0) {
    return {
      action: 'no_op',
      message: `There are no ${kind} items on the timeline to split.`,
    }
  }

  const itemNumbers = itemNumbersForKind(prompt, kind, totalItems)
  if (!itemNumbers || itemNumbers.length === 0) {
    return {
      action: 'no_op',
      message: `Could not determine which ${kind} items to split.`,
    }
  }

  const splits: SplitInstruction[] = []
  const missing: number[] = []
  for (const itemNumber of itemNumbers) {
    const result = splitTimesForItem(kind, index, itemNumber, parts)
    if (!result || result.times.length === 0) {
      missing.push(itemNumber)
      continue
    }
    splits.push({ type: kind, id: result.id, times: result.times })
  }

  if (splits.length === 0) {
    return {
      action: 'no_op',
      message:
        missing.length === 1
          ? `Could not find ${kind} #${missing[0]}.`
          : `Could not find the requested ${kind} items to split.`,
    }
  }

  const first = itemNumbers[0]
  const last = itemNumbers[itemNumbers.length - 1]
  const message =
    splits.length === 1
      ? parts === 2
        ? `Split ${kind} #${first} in half.`
        : `Split ${kind} #${first} into ${parts} equal parts.`
      : parts === 2
        ? `Split ${kind}s #${first}–#${last} in half.`
        : `Split ${kind}s #${first}–#${last} into ${parts} equal parts each.`

  return {
    action: 'split_at_marks',
    splits,
    message,
  }
}

export function localSplitIntentMismatch(
  prompt: string,
  response: LocalRoutePromptResponse,
  manifest: LocalChatManifest
): string | null {
  if (response.action !== 'split_at_marks') {
    return null
  }

  const expected = resolveLocalSplitIntent(prompt, manifest)
  if (!expected?.splits || expected.splits.length <= 1) {
    return null
  }

  const actual = response.splits ?? []
  if (actual.length >= expected.splits.length) {
    return null
  }

  return `Expected ${expected.splits.length} splits but got ${actual.length}.`
}
