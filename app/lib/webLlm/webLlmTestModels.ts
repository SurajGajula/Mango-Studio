export type WebLlmTestModelPreset = {
  id: string
  label: string
  description: string
  supportsFunctionCalling: boolean
  vramRequiredMb?: number
}

export const WEB_LLM_DEFAULT_CHAT_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

export const WEB_LLM_DEFAULT_TOOL_MODEL = 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC'

export const WEB_LLM_TEST_MODEL_PRESETS: WebLlmTestModelPreset[] = [
  {
    id: WEB_LLM_DEFAULT_CHAT_MODEL,
    label: 'Llama 3.2 1B (fast chat)',
    description: 'Smallest preset for quick chat smoke tests.',
    supportsFunctionCalling: false,
    vramRequiredMb: 879,
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B (better chat)',
    description: 'Better replies, larger download.',
    supportsFunctionCalling: false,
    vramRequiredMb: 2264,
  },
  {
    id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',
    label: 'Hermes 3 Llama 3.2 3B',
    description: 'Mid-size Hermes model for manual tool-style outputs.',
    supportsFunctionCalling: false,
    vramRequiredMb: 2264,
  },
  {
    id: WEB_LLM_DEFAULT_TOOL_MODEL,
    label: 'Hermes 3 Llama 3.1 8B (OpenAI tools)',
    description: 'Built-in WebLLM function-calling support via tools API.',
    supportsFunctionCalling: true,
    vramRequiredMb: 5000,
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    label: 'Hermes 2 Pro Llama 3 8B (OpenAI tools)',
    description: 'Alternative tool-calling model from WebLLM presets.',
    supportsFunctionCalling: true,
    vramRequiredMb: 5000,
  },
]

export function getWebLlmTestModelPreset(modelId: string): WebLlmTestModelPreset | undefined {
  return WEB_LLM_TEST_MODEL_PRESETS.find((preset) => preset.id === modelId)
}

export const WEB_LLM_TOOL_MODEL_PRESETS = WEB_LLM_TEST_MODEL_PRESETS.filter(
  (preset) => preset.supportsFunctionCalling
)

export const WEB_LLM_CHAT_MODEL_PRESETS = WEB_LLM_TEST_MODEL_PRESETS.filter(
  (preset) => !preset.supportsFunctionCalling
)
