import {
  WEB_LLM_ROUTE_EXPERIMENTS,
  getWebLlmRouteExperiment,
  type WebLlmRoutingTier,
} from '@/app/lib/webLlm/webLlmRouteExperiments'
import { validateWebLlmExperimentResult } from '@/app/lib/webLlm/webLlmRouteTestValidation'
import { runWebLlmToolCallTest } from '@/app/lib/webLlm/webLlmTestEngine'

export type WebLlmExperimentRunResult = {
  experimentId: string
  title: string
  tier: WebLlmRoutingTier
  passed: boolean
  toolName: string | null
  toolArguments: string | null
  issues: string[]
  notes: string[]
  latencyMs: number | null
  error: string | null
}

export async function runWebLlmRouteExperiment(
  experimentId: string
): Promise<WebLlmExperimentRunResult> {
  const experiment = getWebLlmRouteExperiment(experimentId)
  if (!experiment) {
    return {
      experimentId,
      title: experimentId,
      tier: 'cloud_only',
      passed: false,
      toolName: null,
      toolArguments: null,
      issues: [`Unknown experiment "${experimentId}".`],
      notes: [],
      latencyMs: null,
      error: 'Unknown experiment',
    }
  }

  const startedAt = performance.now()

  try {
    const result = await runWebLlmToolCallTest(experiment.prompt, experiment.tools)
    const validation = validateWebLlmExperimentResult(
      experiment.id,
      result.toolName,
      result.toolArguments
    )

    return {
      experimentId: experiment.id,
      title: experiment.title,
      tier: experiment.tier,
      passed: validation.passed,
      toolName: result.toolName,
      toolArguments: result.toolArguments,
      issues: validation.issues,
      notes: validation.notes,
      latencyMs: Math.round(performance.now() - startedAt),
      error: null,
    }
  } catch (runError) {
    return {
      experimentId: experiment.id,
      title: experiment.title,
      tier: experiment.tier,
      passed: false,
      toolName: null,
      toolArguments: null,
      issues: [],
      notes: [],
      latencyMs: Math.round(performance.now() - startedAt),
      error: runError instanceof Error ? runError.message : 'Experiment failed',
    }
  }
}

export type WebLlmExperimentBatchSummary = {
  total: number
  passed: number
  failed: number
  byTier: Record<
    WebLlmRoutingTier,
    {
      total: number
      passed: number
      passRate: number
      recommendation: string
    }
  >
  results: WebLlmExperimentRunResult[]
}

const tierRecommendations: Record<WebLlmRoutingTier, (passRate: number) => string> = {
  local_safe: (passRate) => {
    if (passRate >= 0.9) {
      return 'Strong candidate for Local AI mode without cloud fallback.'
    }
    if (passRate >= 0.7) {
      return 'Mostly ready; keep cloud fallback for misses.'
    }
    return 'Not ready for local-only handling yet.'
  },
  local_try: (passRate) => {
    if (passRate >= 0.8) {
      return 'Safe to try in Local AI mode with validation + cloud fallback.'
    }
    if (passRate >= 0.5) {
      return 'Mixed results; only enable with strict validation.'
    }
    return 'Keep on cloud routing for now.'
  },
  cloud_only: (passRate) => {
    if (passRate >= 0.9) {
      return 'Local model correctly refuses these intents.'
    }
    if (passRate >= 0.7) {
      return 'Mostly refuses correctly; still route these to cloud in production.'
    }
    return 'Local model may mis-route; never enable these locally without fixes.'
  },
}

export function summarizeWebLlmExperimentBatch(
  results: WebLlmExperimentRunResult[]
): WebLlmExperimentBatchSummary {
  const tiers: WebLlmRoutingTier[] = ['local_safe', 'local_try', 'cloud_only']
  const byTier = {} as WebLlmExperimentBatchSummary['byTier']

  for (const tier of tiers) {
    const tierResults = results.filter((result) => result.tier === tier)
    const passed = tierResults.filter((result) => result.passed).length
    const total = tierResults.length
    const passRate = total === 0 ? 0 : passed / total
    byTier[tier] = {
      total,
      passed,
      passRate,
      recommendation: tierRecommendations[tier](passRate),
    }
  }

  const passed = results.filter((result) => result.passed).length

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    byTier,
    results,
  }
}

export async function runWebLlmRouteExperimentBatch(
  experimentIds: string[]
): Promise<WebLlmExperimentBatchSummary> {
  const results: WebLlmExperimentRunResult[] = []
  for (const experimentId of experimentIds) {
    results.push(await runWebLlmRouteExperiment(experimentId))
  }
  return summarizeWebLlmExperimentBatch(results)
}

export function allWebLlmRouteExperimentIds(): string[] {
  return WEB_LLM_ROUTE_EXPERIMENTS.map((experiment) => experiment.id)
}

export function webLlmRouteExperimentIdsForTier(tier: WebLlmRoutingTier): string[] {
  return WEB_LLM_ROUTE_EXPERIMENTS.filter((experiment) => experiment.tier === tier).map(
    (experiment) => experiment.id
  )
}
