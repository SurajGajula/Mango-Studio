import type { AddTextInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'

export function resolveLocalAddTextIntent(prompt: string): LocalRoutePromptResponse | null {
  const match = prompt.match(
    /\badd\s+text\s+["']([^"']+)["']\s+from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/i
  )
  if (!match) {
    return null
  }

  const content = match[1]
  const startTime = Number.parseFloat(match[2])
  const endTime = Number.parseFloat(match[3])
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return {
      action: 'no_op',
      message: 'Text overlay end time must be after start time.',
    }
  }

  const newTexts: AddTextInstruction[] = [{ content, startTime, endTime }]
  return {
    action: 'add_text',
    newTexts,
    message: `Added text "${content}" from ${startTime}s to ${endTime}s.`,
  }
}
