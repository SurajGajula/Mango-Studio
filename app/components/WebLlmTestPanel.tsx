'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import styles from '@/app/components/WebLlmTestPanel.module.css'
import { isBrowserEnvironment, isWebGpuAvailable } from '@/app/lib/webLlm/webLlmCapabilities'
import {
  getLoadedWebLlmModelId,
  loadWebLlmTestEngine,
  runWebLlmChatTest,
  runWebLlmToolCallTest,
  unloadWebLlmTestEngine,
} from '@/app/lib/webLlm/webLlmTestEngine'
import {
  WEB_LLM_CHAT_MODEL_PRESETS,
  WEB_LLM_DEFAULT_CHAT_MODEL,
  WEB_LLM_DEFAULT_TOOL_MODEL,
  WEB_LLM_TOOL_MODEL_PRESETS,
  getWebLlmTestModelPreset,
} from '@/app/lib/webLlm/webLlmTestModels'
import {
  WEB_LLM_EDIT_MANIFEST_TOOL,
  WEB_LLM_ROUTE_TEST_PROMPT,
} from '@/app/lib/webLlm/webLlmTestTools'
import { validateWebLlmRouteTestResult } from '@/app/lib/webLlm/webLlmRouteTestValidation'
import WebLlmExperimentsSection from '@/app/components/WebLlmExperimentsSection'

type TestMode = 'chat' | 'tool' | 'experiments'

const DEFAULT_CHAT_PROMPT = 'In one sentence, what does a video timeline editor do?'

export default function WebLlmTestPanel() {
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null)
  const [modelId, setModelId] = useState(WEB_LLM_DEFAULT_CHAT_MODEL)
  const [mode, setMode] = useState<TestMode>('chat')
  const [prompt, setPrompt] = useState(DEFAULT_CHAT_PROMPT)
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  const [loadStatusText, setLoadStatusText] = useState('')
  const [isLoadingModel, setIsLoadingModel] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [loadedModel, setLoadedModel] = useState<string | null>(null)
  const [output, setOutput] = useState('Pick a model, load it, then run a chat or tool-call test.')
  const [error, setError] = useState<string | null>(null)

  const visiblePresets =
    mode === 'chat' ? WEB_LLM_CHAT_MODEL_PRESETS : WEB_LLM_TOOL_MODEL_PRESETS

  const selectedPreset = useMemo(
    () => getWebLlmTestModelPreset(modelId),
    [modelId]
  )

  const loadedPreset = useMemo(
    () => (loadedModel ? getWebLlmTestModelPreset(loadedModel) : undefined),
    [loadedModel]
  )

  const loadedModelMismatch = loadedModel !== null && loadedModel !== modelId
  const loadedModelIncompatibleWithMode =
    mode === 'tool' ? !loadedPreset?.supportsFunctionCalling : false

  useEffect(() => {
    if (!isBrowserEnvironment()) {
      return
    }

    void isWebGpuAvailable().then(setWebGpuAvailable)
  }, [])

  useEffect(() => {
    if (mode === 'experiments') {
      setModelId((current) => {
        const preset = getWebLlmTestModelPreset(current)
        if (preset?.supportsFunctionCalling) {
          return current
        }
        return WEB_LLM_DEFAULT_TOOL_MODEL
      })
      return
    }

    if (mode === 'tool') {
      setPrompt(WEB_LLM_ROUTE_TEST_PROMPT)
      setModelId((current) => {
        const preset = getWebLlmTestModelPreset(current)
        if (preset?.supportsFunctionCalling) {
          return current
        }
        return WEB_LLM_DEFAULT_TOOL_MODEL
      })
      setLoadedModel((current) => {
        if (!current) {
          return null
        }
        const preset = getWebLlmTestModelPreset(current)
        return preset?.supportsFunctionCalling ? current : null
      })
      return
    }

    setModelId((current) => {
      const preset = getWebLlmTestModelPreset(current)
      if (preset && !preset.supportsFunctionCalling) {
        return current
      }
      return WEB_LLM_DEFAULT_CHAT_MODEL
    })
    setPrompt((current) =>
      current === WEB_LLM_ROUTE_TEST_PROMPT ? DEFAULT_CHAT_PROMPT : current
    )
  }, [mode])

  const loadSelectedModel = async (statusPrefix: string) => {
    setError(null)
    setIsLoadingModel(true)
    setLoadProgress(0)
    setLoadStatusText(`${statusPrefix} Starting model download...`)

    try {
      await loadWebLlmTestEngine(modelId, (report) => {
        setLoadProgress(report.progress)
        setLoadStatusText(report.text)
      })
      const activeModel = getLoadedWebLlmModelId()
      setLoadedModel(activeModel)
      setOutput(
        activeModel
          ? `Loaded ${activeModel}.\nFirst run can take a while while weights are cached in the browser.`
          : 'Model loaded.'
      )
      return activeModel
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load model')
      setLoadedModel(null)
      return null
    } finally {
      setIsLoadingModel(false)
      setLoadProgress(null)
      setLoadStatusText('')
    }
  }

  const ensureSelectedModelLoaded = async () => {
    const activeModel = getLoadedWebLlmModelId()
    if (activeModel === modelId) {
      return activeModel
    }

    setOutput(`Loading ${modelId}...`)
    return loadSelectedModel('Preparing test.')
  }

  const handleLoadModel = async () => {
    await loadSelectedModel('Starting model download...')
  }

  const handleUnloadModel = async () => {
    setError(null)
    setIsLoadingModel(true)
    try {
      await unloadWebLlmTestEngine()
      setLoadedModel(null)
      setOutput('Model unloaded.')
    } catch (unloadError) {
      setError(unloadError instanceof Error ? unloadError.message : 'Failed to unload model')
    } finally {
      setIsLoadingModel(false)
    }
  }

  const handleRunTest = async () => {
    setError(null)
    setIsRunning(true)
    setOutput('Running...')

    try {
      const activeModel = await ensureSelectedModelLoaded()
      if (!activeModel) {
        setOutput('Could not load the selected model.')
        return
      }

      if (mode === 'chat') {
        const result = await runWebLlmChatTest(prompt)
        setOutput(
          [
            'Chat result',
            '------------',
            result.content || '(empty response)',
            '',
            'Raw response',
            '------------',
            JSON.stringify(result.raw, null, 2),
          ].join('\n')
        )
        return
      }

      const result = await runWebLlmToolCallTest(prompt, [WEB_LLM_EDIT_MANIFEST_TOOL])
      const validation = validateWebLlmRouteTestResult(
        result.toolName,
        result.toolArguments,
        prompt
      )
      setOutput(
        [
          'Tool call result',
          '----------------',
          `tool: ${result.toolName ?? '(none)'}`,
          `arguments: ${result.toolArguments ?? '(none)'}`,
          `assistant message: ${result.message ?? '(none)'}`,
          '',
          'Validation',
          '----------',
          validation.passed ? 'PASS' : 'FAIL',
          ...(validation.notes.length > 0 ? ['', ...validation.notes] : []),
          ...(validation.issues.length > 0 ? ['', 'Issues:', ...validation.issues.map((issue) => `- ${issue}`)] : []),
          '',
          'Raw response',
          '------------',
          JSON.stringify(result.raw, null, 2),
        ].join('\n')
      )
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Test run failed')
      setOutput('Test failed.')
    } finally {
      setIsRunning(false)
    }
  }

  const webGpuLabel =
    webGpuAvailable === null ? 'Checking...' : webGpuAvailable ? 'Available' : 'Not available'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>WebLLM Test Harness</h1>
        <p className={styles.subtitle}>
          Local browser inference smoke test for future client-side chat routing. Use Chrome or Edge
          with WebGPU enabled. This page is separate from the main editor chat, which still uses
          Gemini.
        </p>
      </div>

      <div className={styles.panel}>
        <section className={styles.statusCard}>
          <div className={styles.statusRow}>
            <div>
              <span className={styles.statusLabel}>WebGPU: </span>
              <span
                className={
                  webGpuAvailable ? styles.statusValueOk : styles.statusValueBad
                }
              >
                {webGpuLabel}
              </span>
            </div>
            <div>
              <span className={styles.statusLabel}>Loaded model: </span>
              <span className={styles.statusValue}>{loadedModel ?? 'None'}</span>
            </div>
          </div>
          <p className={styles.hint}>
            Back to app: <Link className={styles.link} href="/">Home</Link>
            {' · '}
            <Link className={styles.link} href="/dev/routing-dataset">Routing dataset generator</Link>
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="webllm-model">
              Model preset
            </label>
            <select
              id="webllm-model"
              className={styles.select}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              disabled={isLoadingModel || isRunning}
            >
              {visiblePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            {loadedModelMismatch ? (
              <p className={styles.hint}>
                Selected model differs from the loaded model. Running a test will load the selected
                preset automatically.
              </p>
            ) : null}
            {loadedModelIncompatibleWithMode ? (
              <p className={styles.hint}>
                The loaded chat model cannot run tool calls. Load a Hermes preset or press Run to
                load the selected tool model.
              </p>
            ) : null}
            {selectedPreset ? (
              <p className={styles.hint}>
                {selectedPreset.description}
                {selectedPreset.vramRequiredMb
                  ? ` Approx VRAM: ${Math.round(selectedPreset.vramRequiredMb)} MB.`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void handleLoadModel()}
              disabled={isLoadingModel || isRunning || webGpuAvailable === false}
            >
              {isLoadingModel ? 'Loading model...' : 'Load model'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => void handleUnloadModel()}
              disabled={isLoadingModel || isRunning || !loadedModel}
            >
              Unload
            </button>
          </div>

          {loadProgress !== null ? (
            <div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.round(loadProgress * 100)}%` }}
                />
              </div>
              <p className={styles.progressText}>
                {loadStatusText || `${Math.round(loadProgress * 100)}%`}
              </p>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${styles.button} ${mode === 'chat' ? '' : styles.buttonSecondary}`}
              onClick={() => setMode('chat')}
              disabled={isRunning}
            >
              Chat test
            </button>
            <button
              type="button"
              className={`${styles.button} ${mode === 'tool' ? '' : styles.buttonSecondary}`}
              onClick={() => setMode('tool')}
              disabled={isRunning}
            >
              Tool-call test
            </button>
            <button
              type="button"
              className={`${styles.button} ${mode === 'experiments' ? '' : styles.buttonSecondary}`}
              onClick={() => setMode('experiments')}
              disabled={isRunning}
            >
              Routing experiments
            </button>
          </div>

          {mode === 'experiments' ? (
            <WebLlmExperimentsSection
              disabled={isLoadingModel || webGpuAvailable === false}
              ensureModelLoaded={ensureSelectedModelLoaded}
            />
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="webllm-prompt">
                  {mode === 'chat' ? 'Prompt' : 'Routing-style prompt'}
                </label>
                <textarea
                  id="webllm-prompt"
                  className={styles.textarea}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={isRunning}
                />
              </div>

              {mode === 'tool' ? (
                <p className={styles.hint}>
                  Tool-call mode only lists Hermes presets. Run will auto-load the selected model if
                  a chat model is still loaded.
                </p>
              ) : null}

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => void handleRunTest()}
                  disabled={isRunning || isLoadingModel || webGpuAvailable === false}
                >
                  {isRunning
                    ? 'Running...'
                    : mode === 'chat'
                      ? 'Run chat test'
                      : 'Run tool-call test'}
                </button>
              </div>
            </>
          )}
        </section>

        {mode !== 'experiments' ? (
        <section className={styles.section}>
          <p className={styles.label}>Output</p>
          {error ? <p className={styles.statusValueBad}>{error}</p> : null}
          <pre className={styles.output}>{output}</pre>
        </section>
        ) : null}
      </div>
    </div>
  )
}
