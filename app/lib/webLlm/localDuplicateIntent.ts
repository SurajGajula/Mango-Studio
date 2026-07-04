import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function resolveLocalDuplicateIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const match = normalized.match(/\bduplicate\s+(images?|videos?)\s+(\d+)\s+(?:to|through|-)\s+(\d+)\b/)
  if (!match) {
    return null
  }

  const kind = match[1].startsWith('video') ? 'video' : 'image'
  const firstNumber = Number.parseInt(match[2], 10)
  const lastNumber = Number.parseInt(match[3], 10)
  if (!Number.isFinite(firstNumber) || !Number.isFinite(lastNumber) || lastNumber < firstNumber) {
    return null
  }

  const ids = idsForKind(indexLocalManifest(manifest), kind)
  if (ids.length === 0) {
    return { action: 'no_op', message: `There are no ${kind}s on the timeline to duplicate.` }
  }
  if (firstNumber < 1 || lastNumber > ids.length) {
    return {
      action: 'no_op',
      message: `${kind} range #${firstNumber}–#${lastNumber} is out of range (1–${ids.length}).`,
    }
  }

  return {
    action: 'duplicate_timeline_range',
    duplicateRange: { kind, firstNumber, lastNumber },
    message: `Duplicated ${kind}s #${firstNumber}–#${lastNumber}.`,
  }
}
