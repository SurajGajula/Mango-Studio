import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { processLocalLlmToolResult } from '@/app/lib/webLlm/localLlmRouteProcess'

export function validateTrainingToolCall(
  prompt: string,
  manifest: LocalChatManifest,
  toolName: string,
  toolArguments: string
): string | null {
  const processed = processLocalLlmToolResult(
    {
      toolName,
      toolArguments,
      message: null,
      raw: {},
    },
    prompt,
    manifest
  )

  if (processed.status === 'success' || processed.status === 'explicit_no_op') {
    return null
  }

  return processed.response.message ?? processed.validationError ?? 'Invalid training example.'
}

export function toolCallsMatchGroundTruth(
  groundTruthToolName: string,
  groundTruthArguments: string,
  candidateToolName: string,
  candidateArguments: string
): boolean {
  if (groundTruthToolName !== candidateToolName) {
    return false
  }

  try {
    const left = JSON.parse(groundTruthArguments)
    const right = JSON.parse(candidateArguments)
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}
