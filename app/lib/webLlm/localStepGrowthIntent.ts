import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function resolveLocalStepGrowthIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const match = normalized.match(/\bmake\s+image\s+(\d+)\s+grow\s+in\s+(\d+)\s+steps\b/)
  if (!match) {
    return null
  }

  const imageNumber = Number.parseInt(match[1], 10)
  const steps = Number.parseInt(match[2], 10)
  const id = idsForKind(indexLocalManifest(manifest), 'image')[imageNumber - 1]
  if (!id) {
    return { action: 'no_op', message: `Could not find image #${imageNumber}.` }
  }

  return {
    action: 'set_step_growth',
    stepGrowth: [{ id, imageNumber, target: 'image_number', steps }],
    message: `Set image #${imageNumber} to grow in ${steps} steps.`,
  }
}
