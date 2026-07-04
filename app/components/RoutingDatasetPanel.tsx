'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from '@/app/components/WebLlmTestPanel.module.css'
import type {
  RoutingDatasetGenerationResult,
  RoutingTrainingExample,
} from '@/app/lib/webLlm/training/trainingExampleTypes'
import { listRoutingTrainingScenarioIds } from '@/app/lib/webLlm/training/generateRoutingDataset'

export default function RoutingDatasetPanel() {
  const [count, setCount] = useState(25)
  const [seed, setSeed] = useState(String(Date.now()))
  const [includeExperiments, setIncludeExperiments] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RoutingDatasetGenerationResult | null>(null)

  const handleGenerate = async () => {
    setError(null)
    setIsGenerating(true)
    setResult(null)

    try {
      const response = await fetch('/api/dev/routing-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          seed: Number.parseInt(seed, 10),
          includeExperiments,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate dataset')
      }

      setResult(data as RoutingDatasetGenerationResult)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate dataset')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = () => {
    if (!result?.jsonl) {
      return
    }
    const blob = new Blob([result.jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `local-routing-dataset-${Date.now()}.jsonl`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const previewExamples = result?.examples.slice(0, 5) ?? []

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Local routing dataset generator</h1>
        <p className={styles.subtitle}>
          Build JSONL fine-tuning data for the browser local routing model from validated rule outputs
          and synthetic scenarios.
        </p>
        <p className={styles.subtitle}>
          <Link href="/dev/web-llm">Back to WebLLM tests</Link>
        </p>
      </div>

      <div className={styles.panel}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Generation settings</h2>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Example count</span>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(event) => setCount(Number.parseInt(event.target.value, 10) || 1)}
              />
            </label>
            <label className={styles.field}>
              <span>Seed</span>
              <input value={seed} onChange={(event) => setSeed(event.target.value)} />
            </label>
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeExperiments}
              onChange={() => setIncludeExperiments((value) => !value)}
            />
            <span>Include built-in routing experiments as baseline examples</span>
          </label>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} disabled={isGenerating} onClick={() => void handleGenerate()}>
              {isGenerating ? 'Generating...' : 'Generate dataset'}
            </button>
            <button type="button" className={styles.secondaryButton} disabled={!result?.jsonl} onClick={handleDownload}>
              Download JSONL
            </button>
          </div>

          {error ? <p className={styles.errorText}>{error}</p> : null}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Scenario templates</h2>
          <p className={styles.helpText}>{listRoutingTrainingScenarioIds().join(', ')}</p>
        </section>

        {result ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Results</h2>
            <p className={styles.helpText}>
              Produced {result.stats.produced} valid examples ({result.stats.valid} valid, {result.stats.invalid}{' '}
              invalid, {result.stats.skipped} skipped).
            </p>
            <pre className={styles.output}>{JSON.stringify(result.stats, null, 2)}</pre>
            <h3 className={styles.sectionTitle}>Preview</h3>
            <pre className={styles.output}>{formatPreview(previewExamples)}</pre>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function formatPreview(examples: RoutingTrainingExample[]): string {
  return examples
    .map((example) =>
      [
        `# ${example.id} [${example.source}] ${example.scenarioId}`,
        `prompt: ${example.prompt}`,
        `tool: ${example.toolName}`,
        `args: ${example.toolArguments}`,
      ].join('\n')
    )
    .join('\n\n')
}
