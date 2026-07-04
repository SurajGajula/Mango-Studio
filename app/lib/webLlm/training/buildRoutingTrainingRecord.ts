import { buildLocalManifestContext, type LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { LOCAL_CHAT_ROUTING_INSTRUCTION } from '@/app/lib/webLlm/localChatSystemInstruction'
import { WEB_LLM_LOCAL_CHAT_TOOLS } from '@/app/lib/webLlm/webLlmTestTools'

export function buildRoutedPromptForTraining(prompt: string, manifest: LocalChatManifest): string {
  const manifestContext = buildLocalManifestContext(manifest)
  return `${LOCAL_CHAT_ROUTING_INSTRUCTION}\n\nUser request: ${prompt.trim()}\n\n${manifestContext}`
}

export type RoutingTrainingJsonlRecord = {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string | null
    tool_calls?: Array<{
      type: 'function'
      function: {
        name: string
        arguments: string
      }
    }>
  }>
  tools: typeof WEB_LLM_LOCAL_CHAT_TOOLS
}

export function buildRoutingTrainingJsonlRecord(input: {
  prompt: string
  manifest: LocalChatManifest
  toolName: string
  toolArguments: string
}): RoutingTrainingJsonlRecord {
  return {
    messages: [
      {
        role: 'user',
        content: buildRoutedPromptForTraining(input.prompt, input.manifest),
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            type: 'function',
            function: {
              name: input.toolName,
              arguments: input.toolArguments,
            },
          },
        ],
      },
    ],
    tools: WEB_LLM_LOCAL_CHAT_TOOLS,
  }
}

export function formatRoutingTrainingJsonl(records: RoutingTrainingJsonlRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n')
}
