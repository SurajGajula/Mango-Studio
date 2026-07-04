import { buildRoutingTrainingJsonlRecord, formatRoutingTrainingJsonl } from '@/app/lib/webLlm/training/buildRoutingTrainingRecord'
import { routeResponseToToolCall } from '@/app/lib/webLlm/training/routeResponseToToolCall'
import {
  computeRoutingGroundTruth,
  pickScenarioForManifest,
  ROUTING_TRAINING_SCENARIOS,
  scenarioMatchesManifest,
} from '@/app/lib/webLlm/training/routingScenarios'
import { createRng } from '@/app/lib/webLlm/training/rng'
import { generateSyntheticManifest } from '@/app/lib/webLlm/training/syntheticManifestGenerator'
import type {
  RoutingDatasetGenerationResult,
  RoutingTrainingExample,
} from '@/app/lib/webLlm/training/trainingExampleTypes'
import { validateTrainingToolCall } from '@/app/lib/webLlm/training/validateTrainingExample'
import { buildRoutedPromptForTraining } from '@/app/lib/webLlm/training/buildRoutingTrainingRecord'
import { WEB_LLM_ROUTE_EXPERIMENTS } from '@/app/lib/webLlm/webLlmRouteExperiments'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'

export type GenerateRoutingDatasetOptions = {
  count: number
  seed?: number
  includeExperiments?: boolean
}

function emptyStats(requested: number) {
  return {
    requested,
    produced: 0,
    valid: 0,
    invalid: 0,
    skipped: 0,
  }
}

function manifestFromExperimentPrompt(prompt: string): LocalChatManifest | null {
  const videosMatch = prompt.match(/Videos \(\d+\):\n([\s\S]*?)(?:\n(?:Images|Texts|Audios|Effects)|$)/)
  const imagesMatch = prompt.match(/Images \(\d+\):\n([\s\S]*?)(?:\n(?:Videos|Texts|Audios|Effects)|$)/)

  const parseLines = (block: string | undefined, kind: 'video' | 'image') => {
    if (!block) return []
    return block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- #'))
      .map((line) => {
        const idMatch = line.match(/id="([^"]+)"/)
        const mutedMatch = line.match(/muted=(true|false)/)
        const transitionMatch = line.match(/transition=([a-z-]+)/)
        if (!idMatch) return null
        if (kind === 'video') {
          const titleMatch = line.match(/title="([^"]*)"/)
          const timestampMatch = line.match(/timestamp=([0-9.]+)s/)
          const durationMatch = line.match(/duration=([0-9.]+)s/)
          return {
            id: idMatch[1],
            title: titleMatch?.[1] ?? '',
            timestamp: Number.parseFloat(timestampMatch?.[1] ?? '0'),
            duration: Number.parseFloat(durationMatch?.[1] ?? '3'),
            muted: mutedMatch?.[1] === 'true',
            transition: transitionMatch?.[1] ?? 'none',
          }
        }
        const nameMatch = line.match(/name="([^"]*)"/)
        const startMatch = line.match(/startTime=([0-9.]+)s/)
        const endMatch = line.match(/endTime=([0-9.]+)s/)
        return {
          id: idMatch[1],
          name: nameMatch?.[1] ?? '',
          startTime: Number.parseFloat(startMatch?.[1] ?? '0'),
          endTime: Number.parseFloat(endMatch?.[1] ?? '3'),
          transition: transitionMatch?.[1] ?? 'none',
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }

  const videos = parseLines(videosMatch?.[1], 'video')
  const images = parseLines(imagesMatch?.[1], 'image')
  if (videos.length === 0 && images.length === 0) {
    return null
  }
  const manifest: LocalChatManifest = {}
  if (videos.length > 0) manifest.videos = videos
  if (images.length > 0) manifest.images = images
  return manifest
}

function pushExample(
  examples: RoutingTrainingExample[],
  input: Omit<RoutingTrainingExample, 'id' | 'validationError' | 'matchesGroundTruth'> & {
    validationError?: string | null
    matchesGroundTruth?: boolean | null
  },
  index: number
) {
  examples.push({
    id: `example-${String(index + 1).padStart(4, '0')}`,
    validationError: input.validationError ?? null,
    matchesGroundTruth: input.matchesGroundTruth ?? null,
    ...input,
  })
}

async function addGroundTruthExample(
  examples: RoutingTrainingExample[],
  stats: ReturnType<typeof emptyStats>,
  index: number,
  scenarioId: string,
  prompt: string,
  manifest: LocalChatManifest
) {
  const groundTruth = computeRoutingGroundTruth(prompt, manifest)
  if (!groundTruth) {
    stats.skipped += 1
    return
  }

  const toolCall = routeResponseToToolCall(groundTruth)
  if (!toolCall) {
    stats.skipped += 1
    return
  }

  const validationError = validateTrainingToolCall(
    prompt,
    manifest,
    toolCall.toolName,
    toolCall.toolArguments
  )
  if (validationError) {
    stats.invalid += 1
    return
  }

  pushExample(examples, {
    scenarioId,
    source: 'ground_truth',
    prompt,
    manifest,
    toolName: toolCall.toolName,
    toolArguments: toolCall.toolArguments,
    routedPrompt: buildRoutedPromptForTraining(prompt, manifest),
    validationError: null,
    matchesGroundTruth: true,
  }, index)
  stats.valid += 1
  stats.produced += 1
}

export async function generateRoutingDataset(
  options: GenerateRoutingDatasetOptions
): Promise<RoutingDatasetGenerationResult> {
  const stats = emptyStats(options.count)
  const examples: RoutingTrainingExample[] = []
  const rng = createRng(options.seed ?? Date.now())
  let exampleIndex = 0
  let baselineCount = 0

  if (options.includeExperiments !== false) {
    for (const experiment of WEB_LLM_ROUTE_EXPERIMENTS) {
      const userPrompt = experiment.prompt.split('\n\nCurrent timeline:')[0]?.trim() ?? experiment.prompt
      const manifest = manifestFromExperimentPrompt(experiment.prompt)
      if (!manifest) {
        stats.skipped += 1
        continue
      }

      const before = stats.produced
      await addGroundTruthExample(examples, stats, exampleIndex, experiment.id, userPrompt, manifest)
      if (stats.produced > before) {
        exampleIndex += 1
      }
    }
    baselineCount = stats.produced
  }

  const targetCount = Math.max(0, options.count)
  let attempts = 0
  const maxAttempts = targetCount * 8

  while (stats.produced - baselineCount < targetCount && attempts < maxAttempts) {
    attempts += 1
    const manifest = generateSyntheticManifest(rng, {
      videoCount: rng.int(4, 10),
      imageCount: rng.int(2, 8),
      audioCount: rng.int(1, 4),
      textCount: rng.int(1, 3),
    })

    const scenario = pickScenarioForManifest(rng, manifest)
    if (!scenarioMatchesManifest(scenario, manifest)) {
      stats.skipped += 1
      continue
    }

    const built = scenario.build({ manifest, rng })
    if (!built) {
      stats.skipped += 1
      continue
    }

    const prompt = built.prompt
    const groundTruth = computeRoutingGroundTruth(prompt, manifest)
    const groundTruthTool = groundTruth ? routeResponseToToolCall(groundTruth) : null

    if (groundTruthTool) {
      await addGroundTruthExample(examples, stats, exampleIndex, scenario.id, prompt, manifest)
    } else {
      stats.skipped += 1
    }

    exampleIndex += 1
  }

  const records = examples.map((example) =>
    buildRoutingTrainingJsonlRecord({
      prompt: example.prompt,
      manifest: example.manifest,
      toolName: example.toolName,
      toolArguments: example.toolArguments,
    })
  )

  return {
    examples,
    stats,
    jsonl: formatRoutingTrainingJsonl(records),
  }
}

export function listRoutingTrainingScenarioIds(): string[] {
  return ROUTING_TRAINING_SCENARIOS.map((scenario) => scenario.id)
}
