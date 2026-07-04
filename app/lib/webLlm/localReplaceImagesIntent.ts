import type { ReplaceInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import { resolvePromptItemNumbers } from '@/app/lib/webLlm/parsePromptManifestFilter'

export type LocalUploadedFileMeta = {
  index: number
  name: string
  type?: 'image' | 'audio' | 'video'
}

type ReplaceKind = 'image' | 'video' | 'audio'

const KIND_ALIASES: Record<ReplaceKind, string[]> = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
  audio: ['audio', 'audios', 'sound', 'sounds', 'soundtrack', 'soundtracks', 'music'],
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function isReplaceImagesPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt)
  if (!/\b(?:replace|swap)\b/.test(normalized)) {
    return false
  }
  const aliases = [...KIND_ALIASES.image, ...KIND_ALIASES.video, ...KIND_ALIASES.audio].join('|')
  return new RegExp(`\\b(?:${aliases})\\b`, 'i').test(normalized)
}

function detectReplaceKind(prompt: string): ReplaceKind | null {
  const normalized = normalizePrompt(prompt)
  const hasAudio = new RegExp(`\\b(?:${KIND_ALIASES.audio.join('|')})\\b`, 'i').test(normalized)
  const hasVideo = new RegExp(`\\b(?:${KIND_ALIASES.video.join('|')})\\b`, 'i').test(normalized)
  const hasImage = new RegExp(`\\b(?:${KIND_ALIASES.image.join('|')})\\b`, 'i').test(normalized)
  if (hasAudio && !hasImage && !hasVideo) {
    return 'audio'
  }
  if (hasVideo && !hasImage && !hasAudio) {
    return 'video'
  }
  if (hasImage && !hasAudio && !hasVideo) {
    return 'image'
  }
  if (hasImage && hasVideo && !hasAudio) {
    return 'image'
  }
  return null
}

function isAllItemsPattern(normalized: string, kind: ReplaceKind): boolean {
  const aliases = KIND_ALIASES[kind].join('|')
  return new RegExp(`\\ball\\s+(?:the\\s+)?(?:${aliases})\\b`, 'i').test(normalized)
}

function targetItemNumbers(prompt: string, kind: ReplaceKind): number[] | null {
  const normalized = normalizePrompt(prompt)
  if (isAllItemsPattern(normalized, kind)) {
    return null
  }
  const section = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio'
  const resolved = resolvePromptItemNumbers(prompt, section)
  if (resolved === 'all') {
    return null
  }
  if (resolved && resolved.length > 0) {
    return resolved
  }
  const aliases = KIND_ALIASES[kind].join('|')
  const singleMatch = normalized.match(new RegExp(`\\b(?:${aliases})\\s*(\\d+)\\b`, 'i'))
  if (singleMatch) {
    const itemNumber = Number.parseInt(singleMatch[1], 10)
    if (Number.isFinite(itemNumber) && itemNumber >= 1) {
      return [itemNumber]
    }
  }
  return null
}

function compatibleFileIndices(
  uploadedFiles: LocalUploadedFileMeta[],
  kind: ReplaceKind
): number[] {
  return uploadedFiles
    .filter((file) => {
      if (kind === 'audio') {
        return file.type === 'audio'
      }
      return file.type === 'image' || file.type === 'video'
    })
    .map((file) => file.index)
}

function fileIndicesForTargets(
  compatibleIndices: number[],
  targetCount: number
): number[] | null {
  if (compatibleIndices.length === 0 || targetCount === 0) {
    return null
  }
  if (compatibleIndices.length === 1) {
    return Array.from({ length: targetCount }, () => compatibleIndices[0])
  }
  if (compatibleIndices.length === targetCount) {
    return compatibleIndices
  }
  return null
}

export function resolveLocalReplaceImagesIntent(
  prompt: string,
  manifest: LocalChatManifest,
  uploadedFiles: LocalUploadedFileMeta[]
): LocalRoutePromptResponse | null {
  if (uploadedFiles.length === 0 || !isReplaceImagesPrompt(prompt)) {
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
  let itemNumbers: number[] | null = targetItemNumbers(prompt, kind)
  if (itemNumbers === null && isAllItemsPattern(normalized, kind)) {
    itemNumbers = ids.map((_, i) => i + 1)
  }
  if (!itemNumbers || itemNumbers.length === 0) {
    return {
      action: 'no_op',
      message: `Could not determine which ${kind} items to replace.`,
    }
  }

  const sortedNumbers = [...new Set(itemNumbers)].sort((a, b) => a - b)
  const targetIds = sortedNumbers
    .map((number) => ids[number - 1])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (targetIds.length === 0) {
    return {
      action: 'no_op',
      message: `Could not find the requested ${kind} item numbers on the timeline.`,
    }
  }

  const compatibleIndices = compatibleFileIndices(uploadedFiles, kind)
  const fileIndices = fileIndicesForTargets(compatibleIndices, targetIds.length)
  if (!fileIndices) {
    return {
      action: 'no_op',
      message:
        'Attach one compatible file to replace a range, or one file per timeline item.',
    }
  }

  const replacements: ReplaceInstruction[] = targetIds.map((targetId, i) => ({
    targetId,
    fileIndex: fileIndices[i],
  }))

  const kindLabel = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio'
  const message =
    replacements.length === 1
      ? `Replaced ${kindLabel} #${sortedNumbers[0]}.`
      : `Replaced ${replacements.length} ${kindLabel}(s).`

  return {
    action: 'replace_images',
    replacements,
    message,
  }
}
