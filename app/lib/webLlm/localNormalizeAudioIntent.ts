import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

function parseAudioNumbers(raw: string): number[] {
  return raw
    .split(/\s*(?:,|and)\s*/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1)
}

export function resolveLocalNormalizeAudioIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const index = indexLocalManifest(manifest)
  const audioCount = index.audios.length
  if (audioCount < 2) {
    return null
  }

  const bulkMatch = normalized.match(
    /\bmake\s+audios?\s+([\d,\sand]+)\s+(?:the\s+)?same\s+volume\s+as\s+audio\s+(\d+)\b/
  )
  if (bulkMatch) {
    const referenceAudioNumber = Number.parseInt(bulkMatch[2], 10)
    const targetAudioNumbers = parseAudioNumbers(bulkMatch[1]).filter((n) => n !== referenceAudioNumber)
    if (targetAudioNumbers.length === 0) {
      return { action: 'no_op', message: 'No target audios to adjust.' }
    }
    return {
      action: 'normalize_audio_volumes',
      normalizeAudioVolumes: { referenceAudioNumber, targetAudioNumbers },
      message: `Matched audios to audio #${referenceAudioNumber}.`,
    }
  }

  const pairMatch = normalized.match(/\bmatch\s+audio\s+(\d+)\s+(?:volume\s+)?to\s+audio\s+(\d+)\b/)
  if (pairMatch) {
    const targetAudioNumber = Number.parseInt(pairMatch[1], 10)
    const referenceAudioNumber = Number.parseInt(pairMatch[2], 10)
    if (targetAudioNumber === referenceAudioNumber) {
      return { action: 'no_op', message: 'Reference and target audio must differ.' }
    }
    return {
      action: 'normalize_audio_volumes',
      normalizeAudioVolumes: {
        referenceAudioNumber,
        targetAudioNumbers: [targetAudioNumber],
      },
      message: `Matched audio #${targetAudioNumber} to audio #${referenceAudioNumber}.`,
    }
  }

  return null
}
