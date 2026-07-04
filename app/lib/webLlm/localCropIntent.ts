import type { CropInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'

const CROP_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function resolveLocalCropIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const match = normalized.match(
    /\b(?:set|make|crop)\s+(image|video)\s+(\d+)\s+(?:crop\s+to\s+|to\s+)?(16:9|4:3|1:1|3:4|9:16|none)\b/
  )
  if (!match) {
    return null
  }

  const kind = match[1] === 'image' ? 'image' : 'video'
  const itemNumber = Number.parseInt(match[2], 10)
  const cropAspect = match[3] as (typeof CROP_ASPECTS)[number] | 'none'
  const id = idsForKind(indexLocalManifest(manifest), kind)[itemNumber - 1]
  if (!id) {
    return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
  }

  const crop: CropInstruction = { type: kind, id, cropAspect }
  return {
    action: 'set_crop',
    crops: [crop],
    message: `Set ${kind} #${itemNumber} crop to ${cropAspect}.`,
  }
}
