'use client'

import { useMemo, useState } from 'react'
import styles from '@/app/components/WebLlmTestPanel.module.css'
import {
  allWebLlmRouteExperimentIds,
  runWebLlmRouteExperimentBatch,
  summarizeWebLlmExperimentBatch,
  type WebLlmExperimentBatchSummary,
  type WebLlmExperimentRunResult,
  webLlmRouteExperimentIdsForTier,
} from '@/app/lib/webLlm/webLlmExperimentRunner'
import {
  formatLocalRoutingRecommendation,
  LOCAL_ROUTING_CAPABILITIES,
} from '@/app/lib/webLlm/webLlmLocalRoutingPolicy'
import {
  WEB_LLM_ROUTE_EXPERIMENTS,
  type WebLlmRoutingTier,
} from '@/app/lib/webLlm/webLlmRouteExperiments'

type WebLlmExperimentsSectionProps = {
  disabled: boolean
  ensureModelLoaded: () => Promise<string | null>
}

const TIER_LABELS: Record<WebLlmRoutingTier, string> = {
  local_safe: 'Local safe',
  local_try: 'Local try',
  cloud_only: 'Cloud only',
}

function tierClassName(tier: WebLlmRoutingTier): string {
  if (tier === 'local_safe') return styles.tierSafe
  if (tier === 'local_try') return styles.tierTry
  return styles.tierCloud
}

function formatBatchSummary(summary: WebLlmExperimentBatchSummary): string {
  const lines = [
    `Batch complete: ${summary.passed}/${summary.total} passed`,
    '',
    'Tier recommendations',
    '--------------------',
  ]

  for (const capability of LOCAL_ROUTING_CAPABILITIES) {
    const tierSummary = summary.byTier[capability.tier]
    lines.push(
      formatLocalRoutingRecommendation(capability.tier, tierSummary.passRate),
      tierSummary.recommendation,
      ''
    )
  }

  lines.push('Results', '-------')
  for (const result of summary.results) {
    lines.push(
      `${result.passed ? 'PASS' : 'FAIL'} [${TIER_LABELS[result.tier]}] ${result.title}${
        result.latencyMs ? ` (${result.latencyMs}ms)` : ''
      }`
    )
    if (result.error) {
      lines.push(`  error: ${result.error}`)
    } else if (result.issues.length > 0) {
      lines.push(`  - ${result.issues[0]}`)
    }
  }

  return lines.join('\n')
}

function formatSingleResult(result: WebLlmExperimentRunResult): string {
  const lines = [
    `${result.passed ? 'PASS' : 'FAIL'}: ${result.title}`,
    `tier: ${TIER_LABELS[result.tier]}`,
    `tool: ${result.toolName ?? '(none)'}`,
    `arguments: ${result.toolArguments ?? '(none)'}`,
  ]

  if (result.latencyMs !== null) {
    lines.push(`latency: ${result.latencyMs}ms`)
  }

  if (result.error) {
    lines.push('', `Error: ${result.error}`)
  }

  if (result.notes.length > 0) {
    lines.push('', ...result.notes)
  }

  if (result.issues.length > 0) {
    lines.push('', 'Issues:', ...result.issues.map((issue) => `- ${issue}`))
  }

  return lines.join('\n')
}

function aggregateRepeatResults(
  allRuns: WebLlmExperimentRunResult[],
  repeat: number
): WebLlmExperimentRunResult[] {
  const grouped = new Map<string, WebLlmExperimentRunResult[]>()
  for (const result of allRuns) {
    const bucket = grouped.get(result.experimentId) ?? []
    bucket.push(result)
    grouped.set(result.experimentId, bucket)
  }

  return Array.from(grouped.entries()).map(([experimentId, results]) => {
    const passed = results.filter((result) => result.passed).length
    const base = results[results.length - 1]
    return {
      ...base,
      experimentId,
      passed: passed === results.length,
      issues:
        passed === results.length ? [] : [`Passed ${passed}/${results.length} repeats.`],
      notes: repeat > 1 ? [`Repeat pass rate: ${passed}/${results.length}.`] : base.notes,
    }
  })
}

export default function WebLlmExperimentsSection({
  disabled,
  ensureModelLoaded,
}: WebLlmExperimentsSectionProps) {
  const [selectedExperimentId, setSelectedExperimentId] = useState(
    WEB_LLM_ROUTE_EXPERIMENTS[0]?.id ?? 'mute_all_videos'
  )
  const [repeatCount, setRepeatCount] = useState(1)
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState(
    'Run one experiment or a batch to see where local routing is safe. Existing app chat is unchanged.'
  )
  const [lastResults, setLastResults] = useState<WebLlmExperimentRunResult[]>([])

  const selectedExperiment = useMemo(
    () => WEB_LLM_ROUTE_EXPERIMENTS.find((experiment) => experiment.id === selectedExperimentId),
    [selectedExperimentId]
  )

  const runExperimentIds = async (experimentIds: string[], repeat: number) => {
    setIsRunning(true)
    setOutput('Loading model and running experiments...')

    try {
      const activeModel = await ensureModelLoaded()
      if (!activeModel) {
        setOutput('Could not load the selected Hermes model.')
        return
      }

      const allRuns: WebLlmExperimentRunResult[] = []
      for (let attempt = 0; attempt < repeat; attempt++) {
        const summary = await runWebLlmRouteExperimentBatch(experimentIds)
        allRuns.push(...summary.results)
        if (repeat > 1) {
          setOutput(`Completed repeat ${attempt + 1}/${repeat}...`)
        }
      }

      setLastResults(allRuns)

      if (experimentIds.length === 1 && repeat === 1) {
        setOutput(formatSingleResult(allRuns[0]))
        return
      }

      const aggregateResults =
        repeat > 1 ? aggregateRepeatResults(allRuns, repeat) : allRuns
      const summary = summarizeWebLlmExperimentBatch(aggregateResults)
      setOutput(formatBatchSummary(summary))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section className={styles.section}>
      <p className={styles.label}>Routing experiments</p>
      <p className={styles.hint}>
        These tests measure local routing quality on representative timeline edit prompts. Chat uses
        the local model plus rules.
      </p>

      <div className={styles.policyGrid}>
        {LOCAL_ROUTING_CAPABILITIES.map((capability) => (
          <div key={capability.tier} className={styles.policyCard}>
            <span className={tierClassName(capability.tier)}>{capability.label}</span>
            <p className={styles.hint}>{capability.description}</p>
          </div>
        ))}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="webllm-experiment">
          Experiment
        </label>
        <select
          id="webllm-experiment"
          className={styles.select}
          value={selectedExperimentId}
          onChange={(event) => setSelectedExperimentId(event.target.value)}
          disabled={disabled || isRunning}
        >
          {WEB_LLM_ROUTE_EXPERIMENTS.map((experiment) => (
            <option key={experiment.id} value={experiment.id}>
              [{TIER_LABELS[experiment.tier]}] {experiment.title}
            </option>
          ))}
        </select>
        {selectedExperiment ? (
          <p className={styles.hint}>{selectedExperiment.description}</p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="webllm-repeat">
          Repeat selected experiment
        </label>
        <select
          id="webllm-repeat"
          className={styles.select}
          value={repeatCount}
          onChange={(event) => setRepeatCount(Number(event.target.value))}
          disabled={disabled || isRunning}
        >
          <option value={1}>1x</option>
          <option value={3}>3x</option>
          <option value={5}>5x</option>
        </select>
      </div>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || isRunning}
          onClick={() => void runExperimentIds([selectedExperimentId], repeatCount)}
        >
          {isRunning ? 'Running...' : 'Run selected'}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          disabled={disabled || isRunning}
          onClick={() => void runExperimentIds(allWebLlmRouteExperimentIds(), 1)}
        >
          Run all
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          disabled={disabled || isRunning}
          onClick={() => void runExperimentIds(webLlmRouteExperimentIdsForTier('local_safe'), 1)}
        >
          Run local safe
        </button>
      </div>

      {lastResults.length > 0 ? (
        <div className={styles.resultsTableWrap}>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Tier</th>
                <th>Result</th>
                <th>Tool</th>
              </tr>
            </thead>
            <tbody>
              {lastResults.map((result, index) => (
                <tr key={`${result.experimentId}-${index}`}>
                  <td>{result.title}</td>
                  <td>
                    <span className={tierClassName(result.tier)}>{TIER_LABELS[result.tier]}</span>
                  </td>
                  <td className={result.passed ? styles.statusValueOk : styles.statusValueBad}>
                    {result.passed ? 'PASS' : 'FAIL'}
                  </td>
                  <td>{result.toolName ?? '(none)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <pre className={styles.output}>{output}</pre>
    </section>
  )
}
