import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'
import { getWebLlmTestModelPreset } from '@/app/lib/webLlm/webLlmTestModels'
import type { WebLlmChatTool } from '@/app/lib/webLlm/webLlmTestTools'

type WebLlmModule = typeof import('@mlc-ai/web-llm')

let webLlmModulePromise: Promise<WebLlmModule> | null = null
let engine: MLCEngineInterface | null = null
let loadedModelId: string | null = null

async function loadWebLlmModule(): Promise<WebLlmModule> {
  if (!webLlmModulePromise) {
    webLlmModulePromise = import('@mlc-ai/web-llm')
  }
  return webLlmModulePromise
}

export type WebLlmChatResult = {
  content: string
  raw: unknown
}

export type WebLlmToolCallResult = {
  toolName: string | null
  toolArguments: string | null
  message: string | null
  raw: unknown
}

export async function loadWebLlmTestEngine(
  modelId: string,
  onProgress: (report: InitProgressReport) => void
): Promise<void> {
  const webllm = await loadWebLlmModule()

  if (engine && loadedModelId === modelId) {
    return
  }

  if (engine) {
    await engine.unload()
    engine = null
    loadedModelId = null
  }

  engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: onProgress,
  })
  loadedModelId = modelId
}

export async function unloadWebLlmTestEngine(): Promise<void> {
  if (!engine) {
    return
  }

  await engine.unload()
  engine = null
  loadedModelId = null
}

export function getLoadedWebLlmModelId(): string | null {
  return loadedModelId
}

export async function modelSupportsOpenAiToolCalling(modelId: string): Promise<boolean> {
  const webllm = await loadWebLlmModule()
  return webllm.functionCallingModelIds.includes(modelId)
}

function requireEngine(): MLCEngineInterface {
  if (!engine) {
    throw new Error('WebLLM engine is not loaded. Load a model first.')
  }
  return engine
}

export async function runWebLlmChatTest(prompt: string): Promise<WebLlmChatResult> {
  const activeEngine = requireEngine()
  const response = await activeEngine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 256,
  })

  const content = response.choices[0]?.message?.content ?? ''
  return { content, raw: response }
}

export async function runWebLlmToolCallTest(
  prompt: string,
  tools: WebLlmChatTool[],
  options?: { maxTokens?: number; forceToolName?: string }
): Promise<WebLlmToolCallResult> {
  const activeEngine = requireEngine()
  const modelId = loadedModelId
  if (!modelId) {
    throw new Error('WebLLM model id is missing after load.')
  }

  const supportsToolCalling = await modelSupportsOpenAiToolCalling(modelId)
  if (!supportsToolCalling) {
    const preset = getWebLlmTestModelPreset(modelId)
    throw new Error(
      preset
        ? `Model "${modelId}" does not support OpenAI-style tool calling. Pick a Hermes preset.`
        : `Model "${modelId}" is not in WebLLM's function-calling model list. Pick a Hermes preset.`
    )
  }

  const response = await activeEngine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    tools,
    tool_choice: options?.forceToolName
      ? { type: 'function', function: { name: options.forceToolName } }
      : 'auto',
    temperature: 0.2,
    max_tokens: options?.maxTokens ?? 1024,
  })

  const message = response.choices[0]?.message
  const toolCall = message?.tool_calls?.[0]

  return {
    toolName: toolCall?.function?.name ?? null,
    toolArguments: toolCall?.function?.arguments ?? null,
    message: typeof message?.content === 'string' ? message.content : null,
    raw: response,
  }
}

export async function listWebLlmFunctionCallingModelIds(): Promise<string[]> {
  const webllm = await loadWebLlmModule()
  return [...webllm.functionCallingModelIds]
}
