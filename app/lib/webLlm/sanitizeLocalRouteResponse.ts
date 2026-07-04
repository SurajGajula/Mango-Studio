import type { DeleteTimelineItemInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { promptMentionsDeleteKind } from '@/app/lib/webLlm/localDeleteIntent'
import { indexLocalManifest, type LocalTimelineKind } from '@/app/lib/webLlm/localManifestIndex'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'

function sanitizeDeleteItems(
  items: DeleteTimelineItemInstruction[],
  kindById: Map<string, LocalTimelineKind>
): DeleteTimelineItemInstruction[] {
  return items.map((item) => {
    const actualKind = kindById.get(item.id)
    if (!actualKind) {
      return item
    }
    if (item.type === actualKind) {
      return item
    }
    return { type: actualKind, id: item.id }
  })
}

export function sanitizeLocalRouteResponse(
  response: LocalRoutePromptResponse,
  manifest: LocalChatManifest
): LocalRoutePromptResponse {
  if (response.action !== 'delete_timeline_items') {
    return response
  }

  const index = indexLocalManifest(manifest)
  const deleteItems = sanitizeDeleteItems(response.deleteItems ?? [], index.kindById)
  return {
    ...response,
    deleteItems,
  }
}

export function localDeleteIntentMismatch(
  prompt: string,
  response: LocalRoutePromptResponse,
  manifest: LocalChatManifest
): string | null {
  if (response.action !== 'delete_timeline_items') {
    return null
  }

  const index = indexLocalManifest(manifest)
  const kinds: LocalTimelineKind[] = ['audio', 'video', 'image', 'text', 'effect']
  const mentionedKinds = kinds.filter((kind) => promptMentionsDeleteKind(prompt, kind))
  if (mentionedKinds.length !== 1) {
    return null
  }

  const expectedKind = mentionedKinds[0]
  const items = response.deleteItems ?? []
  for (const item of items) {
    const actualKind = index.kindById.get(item.id)
    if (actualKind && actualKind !== expectedKind) {
      return `Local routing tried to delete ${actualKind} items instead of ${expectedKind}.`
    }
    if (item.type !== expectedKind) {
      return `Local routing returned the wrong delete type for a ${expectedKind} request.`
    }
  }

  return null
}
