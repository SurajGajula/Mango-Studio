import type { WebLlmRoutingTier } from '@/app/lib/webLlm/webLlmRouteExperiments'

export type LocalRoutingCapability = {
  tier: WebLlmRoutingTier
  label: string
  description: string
  exampleIntents: string[]
}

export const LOCAL_ROUTING_CAPABILITIES: LocalRoutingCapability[] = [
  {
    tier: 'local_safe',
    label: 'Local safe',
    description: 'Simple edits with explicit manifest context. Target for first Local AI mode rollout.',
    exampleIntents: [
      'mute all videos',
      'mute video 1',
      'unmute all videos',
      'set video opacity',
      'delete image 2',
    ],
  },
  {
    tier: 'local_try',
    label: 'Local try + fallback',
    description: 'More complex routing. Use local model only with validation and cloud fallback.',
    exampleIntents: [
      'add fade transition',
      'add text overlay',
      'move item to another row',
      'mute many timeline items',
    ],
  },
  {
    tier: 'cloud_only',
    label: 'Cloud only',
    description: 'Keep existing Gemini chat routing. Local model should no_op or never see these.',
    exampleIntents: [
      'greetings and small talk',
      'image/video/speech generation',
      'transcription',
      'split at marks',
      'normalize audio loudness',
    ],
  },
]

export function formatLocalRoutingRecommendation(
  tier: WebLlmRoutingTier,
  passRate: number
): string {
  const capability = LOCAL_ROUTING_CAPABILITIES.find((entry) => entry.tier === tier)
  const pct = Math.round(passRate * 100)
  return `${capability?.label ?? tier}: ${pct}% pass rate. ${capability?.description ?? ''}`.trim()
}
