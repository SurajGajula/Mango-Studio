import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { mapLocalToolCallToRouteResponse } from '@/app/lib/webLlm/mapLocalToolCall'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { localAddSolidImageIntentMismatch } from '@/app/lib/webLlm/localAddSolidImageIntent'
import { localReplaceSolidIntentMismatch } from '@/app/lib/webLlm/localReplaceSolidIntent'
import { localSplitIntentMismatch } from '@/app/lib/webLlm/localSplitIntent'
import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'
import {
  localDeleteIntentMismatch,
  sanitizeLocalRouteResponse,
} from '@/app/lib/webLlm/sanitizeLocalRouteResponse'
import { promptIsTransitionRemoval } from '@/app/lib/webLlm/localTransitionPrompt'
import { validateLocalRouteResponse } from '@/app/lib/webLlm/validateLocalRouteResponse'
import type { WebLlmToolCallResult } from '@/app/lib/webLlm/webLlmTestEngine'

export type LocalLlmRouteAttempt = {
  status: 'success' | 'no_tool_call' | 'explicit_no_op' | 'invalid' | 'validation_failed'
  response: LocalRoutePromptResponse
  validationError?: string
}

export function processLocalLlmToolResult(
  toolResult: WebLlmToolCallResult,
  prompt: string,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): LocalLlmRouteAttempt {
  if (!toolResult.toolName) {
    return {
      status: 'no_tool_call',
      response: {
        action: 'no_op',
        message: 'Local model did not return a tool call.',
      },
    }
  }

  let mapped: LocalRoutePromptResponse
  try {
    mapped = mapLocalToolCallToRouteResponse(toolResult.toolName, toolResult.toolArguments)
  } catch {
    return {
      status: 'invalid',
      response: {
        action: 'no_op',
        message: 'Local model returned malformed tool arguments.',
      },
    }
  }

  if (mapped.action === 'no_op' && toolResult.toolName === 'no_op') {
    return {
      status: 'explicit_no_op',
      response: mapped,
    }
  }

  if (mapped.action === 'delete_timeline_items' && promptIsTransitionRemoval(prompt)) {
    return {
      status: 'validation_failed',
      response: {
        action: 'no_op',
        message:
          'Removing transitions must use set_transitions with transition "none", not delete_timeline_items.',
      },
      validationError: 'delete_timeline_items used for transition removal',
    }
  }

  mapped = sanitizeLocalRouteResponse(mapped, manifest)

  const deleteMismatch = localDeleteIntentMismatch(prompt, mapped, manifest)
  if (deleteMismatch) {
    return {
      status: 'validation_failed',
      response: { action: 'no_op', message: deleteMismatch },
      validationError: deleteMismatch,
    }
  }

  const solidMismatch = localReplaceSolidIntentMismatch(prompt, mapped, manifest)
  if (solidMismatch) {
    return {
      status: 'validation_failed',
      response: { action: 'no_op', message: solidMismatch },
      validationError: solidMismatch,
    }
  }

  const addSolidMismatch = localAddSolidImageIntentMismatch(prompt, mapped)
  if (addSolidMismatch) {
    return {
      status: 'validation_failed',
      response: { action: 'no_op', message: addSolidMismatch },
      validationError: addSolidMismatch,
    }
  }

  const splitMismatch = localSplitIntentMismatch(prompt, mapped, manifest)
  if (splitMismatch) {
    return {
      status: 'validation_failed',
      response: { action: 'no_op', message: splitMismatch },
      validationError: splitMismatch,
    }
  }

  const validationError = validateLocalRouteResponse(mapped, manifest, uploadedFiles)
  if (validationError) {
    return {
      status: 'validation_failed',
      response: { action: 'no_op', message: validationError },
      validationError,
    }
  }

  return {
    status: 'success',
    response: mapped,
  }
}

export function looksLikeTimelineEditRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase()
  return /\b(?:mute|unmute|delete|remove|replace|swap|add|apply|set|move|opacity|transition|fade|flash|wipe|morph|text|row|solid|every|all|zoom|shake|jitter|stretch|animation|intensity|duration|length|speed|split|duplicate|crop|grow|center|normalize|match|half|vignette|blur|cool|grainy|dither|contrast)\b/.test(
    normalized
  )
}

export function shouldTryRuleFallback(attempt: LocalLlmRouteAttempt): boolean {
  return (
    attempt.status === 'no_tool_call' ||
    attempt.status === 'invalid' ||
    attempt.status === 'validation_failed'
  )
}
