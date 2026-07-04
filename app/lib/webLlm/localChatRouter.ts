import type { InitProgressReport } from '@mlc-ai/web-llm'
import { buildFocusedLocalManifestContext } from '@/app/lib/webLlm/buildFocusedLocalManifestContext'
import { buildUploadedFilesContext } from '@/app/lib/webLlm/buildUploadedFilesContext'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { LOCAL_CHAT_ROUTING_INSTRUCTION } from '@/app/lib/webLlm/localChatSystemInstruction'
import {
  looksLikeTimelineEditRequest,
  processLocalLlmToolResult,
  shouldTryRuleFallback,
  type LocalLlmRouteAttempt,
} from '@/app/lib/webLlm/localLlmRouteProcess'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { getLocalUnsupportedPromptReason } from '@/app/lib/webLlm/localUnsupportedPrompt'
import { resolveLocalRuleFallbackIntent, tryHighConfidenceRuleRoute } from '@/app/lib/webLlm/localRuleRouter'
import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'
import { isAddSolidSpanPrompt } from '@/app/lib/webLlm/localAddSolidImageIntent'
import {
  buildSplitSolidRoutingHints,
  promptLooksLikeSolidOrMediaReplace,
  promptLooksLikeSplit,
} from '@/app/lib/webLlm/localSplitSolidHints'
import { selectLocalChatTools } from '@/app/lib/webLlm/selectLocalChatTools'
import { WEB_LLM_DEFAULT_TOOL_MODEL } from '@/app/lib/webLlm/webLlmTestModels'
import {
  getLoadedWebLlmModelId,
  loadWebLlmTestEngine,
  runWebLlmToolCallTest,
} from '@/app/lib/webLlm/webLlmTestEngine'
import type { WebLlmChatTool } from '@/app/lib/webLlm/webLlmTestTools'

export const LOCAL_CHAT_MODEL_ID = WEB_LLM_DEFAULT_TOOL_MODEL

const LOCAL_CHAT_MAX_TOOL_TOKENS = 768
const LOCAL_CHAT_BULK_TOOL_TOKENS = 1536

export type RouteLocalChatPromptInput = {
  prompt: string
  manifest: LocalChatManifest
  uploadedFiles?: LocalUploadedFileMeta[]
  onModelProgress?: (report: InitProgressReport) => void
}

export function isLocalChatModelReady(): boolean {
  return getLoadedWebLlmModelId() === LOCAL_CHAT_MODEL_ID
}

export async function warmLocalChatEngine(
  onProgress?: (report: InitProgressReport) => void
): Promise<void> {
  await loadWebLlmTestEngine(LOCAL_CHAT_MODEL_ID, (report) => {
    onProgress?.(report)
  })
}

function buildRoutedPrompt(
  prompt: string,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): string {
  const manifestContext = buildFocusedLocalManifestContext(prompt, manifest)
  const filesContext =
    uploadedFiles && uploadedFiles.length > 0 ? `\n\n${buildUploadedFilesContext(uploadedFiles)}` : ''
  const hints = buildSplitSolidRoutingHints(prompt, uploadedFiles)
  return `${LOCAL_CHAT_ROUTING_INSTRUCTION}\n\nUser request: ${prompt.trim()}\n\n${manifestContext}${filesContext}${hints}`
}

function isContextWindowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /context window|context size|too many tokens|maximum context/i.test(message)
}

function contextWindowFailureResponse(): LocalLlmRouteAttempt {
  return {
    status: 'validation_failed',
    response: {
      action: 'no_op',
      message: 'Local model context was exceeded for this project size.',
    },
    validationError: 'context_window_exceeded',
  }
}

function maxTokensForPrompt(prompt: string, uploadedFiles?: LocalUploadedFileMeta[]): number {
  if (promptLooksLikeSplit(prompt) || promptLooksLikeSolidOrMediaReplace(prompt, uploadedFiles)) {
    return LOCAL_CHAT_BULK_TOOL_TOKENS
  }
  return LOCAL_CHAT_MAX_TOOL_TOKENS
}

function primaryToolNames(tools: WebLlmChatTool[]): string[] {
  return tools.map((tool) => tool.function.name).filter((name) => name !== 'no_op')
}

function forceToolNameForPrompt(
  prompt: string,
  tools: WebLlmChatTool[],
  uploadedFiles?: LocalUploadedFileMeta[]
): string | undefined {
  const primary = primaryToolNames(tools)
  if (primary.length === 1) {
    return primary[0]
  }
  if (primary.length === 0) {
    return undefined
  }

  if (uploadedFiles && uploadedFiles.length > 0 && primary.includes('replace_images')) {
    return 'replace_images'
  }
  if (isAddSolidSpanPrompt(prompt) && primary.includes('add_solid_image')) {
    return 'add_solid_image'
  }
  if (primary.includes('replace_with_solid')) {
    return 'replace_with_solid'
  }
  if (primary.includes('split_at_marks')) {
    return 'split_at_marks'
  }
  return primary[0]
}

async function runLocalLlmRouteAttempt(
  routedPrompt: string,
  prompt: string,
  manifest: LocalChatManifest,
  tools: WebLlmChatTool[],
  uploadedFiles?: LocalUploadedFileMeta[],
  forceToolName?: string
): Promise<LocalLlmRouteAttempt> {
  try {
    const toolResult = await runWebLlmToolCallTest(routedPrompt, tools, {
      maxTokens: maxTokensForPrompt(prompt, uploadedFiles),
      forceToolName,
    })
    return processLocalLlmToolResult(toolResult, prompt, manifest, uploadedFiles)
  } catch (error) {
    if (isContextWindowError(error)) {
      return contextWindowFailureResponse()
    }
    throw error
  }
}

export async function routeLocalChatPrompt(
  input: RouteLocalChatPromptInput
): Promise<LocalRoutePromptResponse> {
  const unsupportedReason = getLocalUnsupportedPromptReason(input.prompt)
  if (unsupportedReason) {
    return {
      action: 'no_op',
      message: unsupportedReason,
    }
  }

  const ruleFirst = tryHighConfidenceRuleRoute(
    input.prompt,
    input.manifest,
    input.uploadedFiles
  )
  if (ruleFirst) {
    return ruleFirst
  }

  await loadWebLlmTestEngine(LOCAL_CHAT_MODEL_ID, (report) => {
    input.onModelProgress?.(report)
  })

  const routedPrompt = buildRoutedPrompt(input.prompt, input.manifest, input.uploadedFiles)
  const focusedTools = selectLocalChatTools(input.prompt, input.uploadedFiles)
  const preferForcedTool =
    promptLooksLikeSplit(input.prompt) ||
    promptLooksLikeSolidOrMediaReplace(input.prompt, input.uploadedFiles)
  const initialForceTool = preferForcedTool
    ? forceToolNameForPrompt(input.prompt, focusedTools, input.uploadedFiles)
    : undefined

  let attempt = await runLocalLlmRouteAttempt(
    routedPrompt,
    input.prompt,
    input.manifest,
    focusedTools,
    input.uploadedFiles,
    initialForceTool
  )

  if (shouldTryRuleFallback(attempt) && looksLikeTimelineEditRequest(input.prompt)) {
    const forcedTool = forceToolNameForPrompt(input.prompt, focusedTools, input.uploadedFiles)
    if (forcedTool && forcedTool !== initialForceTool) {
      const retry = await runLocalLlmRouteAttempt(
        routedPrompt,
        input.prompt,
        input.manifest,
        focusedTools,
        input.uploadedFiles,
        forcedTool
      )
      if (retry.status === 'success' || retry.status === 'explicit_no_op') {
        attempt = retry
      }
    } else if (!initialForceTool && forcedTool) {
      const retry = await runLocalLlmRouteAttempt(
        routedPrompt,
        input.prompt,
        input.manifest,
        focusedTools,
        input.uploadedFiles,
        forcedTool
      )
      if (retry.status === 'success' || retry.status === 'explicit_no_op') {
        attempt = retry
      }
    }
  }

  if (attempt.status === 'success' || attempt.status === 'explicit_no_op') {
    return attempt.response
  }

  if (shouldTryRuleFallback(attempt)) {
    const fallback = resolveLocalRuleFallbackIntent(
      input.prompt,
      input.manifest,
      input.uploadedFiles
    )
    if (fallback) {
      return fallback
    }
  }

  return attempt.response
}
