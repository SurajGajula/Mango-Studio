import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'

export type RoutingTrainingExampleSource = 'ground_truth' | 'experiment'

export type RoutingTrainingExample = {
  id: string
  scenarioId: string
  source: RoutingTrainingExampleSource
  prompt: string
  manifest: LocalChatManifest
  toolName: string
  toolArguments: string
  routedPrompt: string
  validationError: string | null
  matchesGroundTruth: boolean | null
}

export type RoutingDatasetGenerationStats = {
  requested: number
  produced: number
  valid: number
  invalid: number
  skipped: number
}

export type RoutingDatasetGenerationResult = {
  examples: RoutingTrainingExample[]
  stats: RoutingDatasetGenerationStats
  jsonl: string
}
