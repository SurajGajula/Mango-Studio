import type { DeleteTimelineItemInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import {
  idsForKind,
  indexLocalManifest,
  type LocalTimelineKind,
} from '@/app/lib/webLlm/localManifestIndex'
import { promptIsTimelineItemDeletion } from '@/app/lib/webLlm/localTransitionPrompt'

const KIND_ALIASES: Record<LocalTimelineKind, string[]> = {
  audio: ['audio', 'audios', 'sound', 'sounds', 'soundtrack', 'soundtracks', 'music'],
  video: ['video', 'videos', 'clip', 'clips'],
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  text: ['text', 'texts', 'caption', 'captions', 'title', 'titles', 'subtitle', 'subtitles'],
  effect: ['effect', 'effects'],
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

function buildKindPattern(kind: LocalTimelineKind): RegExp {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(
    `\\b(?:delete|remove|clear)\\s+(?:the\\s+)?(?:all\\s+)?(?:${aliases})(?:\\s+(?:track|tracks|clip|clips))?\\b`,
    'i'
  )
}

function buildNumberedKindPattern(kind: LocalTimelineKind): RegExp {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(
    `\\b(?:delete|remove|clear)\\s+(?:${aliases})\\s*(\\d+)\\b`,
    'i'
  )
}

function detectDeleteKind(prompt: string): LocalTimelineKind | null {
  const normalized = normalizePrompt(prompt)
  if (!/\b(?:delete|remove|clear)\b/.test(normalized)) {
    return null
  }

  const kinds: LocalTimelineKind[] = ['audio', 'video', 'image', 'text', 'effect']
  const matched = kinds.filter((kind) => buildKindPattern(kind).test(normalized) || buildNumberedKindPattern(kind).test(normalized))
  if (matched.length === 1) {
    return matched[0]
  }
  return null
}

function deleteItemsForKind(
  index: ReturnType<typeof indexLocalManifest>,
  kind: LocalTimelineKind,
  itemNumbers: number[] | 'all'
): DeleteTimelineItemInstruction[] {
  const ids = idsForKind(index, kind)
  if (ids.length === 0) {
    return []
  }

  if (itemNumbers === 'all') {
    return ids.map((id) => ({ type: kind, id }))
  }

  return itemNumbers
    .map((number) => ids[number - 1])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => ({ type: kind, id }))
}

export function resolveLocalDeleteIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  if (!promptIsTimelineItemDeletion(prompt)) {
    return null
  }

  const kind = detectDeleteKind(prompt)
  if (!kind) {
    return null
  }

  const index = indexLocalManifest(manifest)
  const normalized = normalizePrompt(prompt)
  const numberedMatch = normalized.match(buildNumberedKindPattern(kind))
  if (numberedMatch) {
    const itemNumber = Number.parseInt(numberedMatch[1], 10)
    if (!Number.isFinite(itemNumber) || itemNumber < 1) {
      return null
    }
    const items = deleteItemsForKind(index, kind, [itemNumber])
    if (items.length === 0) {
      return {
        action: 'no_op',
        message: `Could not find ${kind} #${itemNumber} on the timeline.`,
      }
    }
    return {
      action: 'delete_timeline_items',
      deleteItems: items,
      message: `Removed ${kind} #${itemNumber}.`,
    }
  }

  const ids = idsForKind(index, kind)
  if (ids.length === 0) {
    return {
      action: 'no_op',
      message: `There are no ${kind} items on the timeline to delete.`,
    }
  }

  const items = deleteItemsForKind(index, kind, 'all')
  return {
    action: 'delete_timeline_items',
    deleteItems: items,
    message:
      items.length === 1
        ? `Removed the ${kind} item.`
        : `Removed ${items.length} ${kind} item(s).`,
  }
}

export function promptMentionsDeleteKind(prompt: string, kind: LocalTimelineKind): boolean {
  const normalized = normalizePrompt(prompt)
  return buildKindPattern(kind).test(normalized) || buildNumberedKindPattern(kind).test(normalized)
}
