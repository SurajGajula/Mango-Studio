import { SOLID_COLOR_PRESETS } from '@/app/lib/solidColorImage'

export function normalizeSolidColorPrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function parseSolidColorFromPrompt(prompt: string): string | null {
  const normalized = normalizeSolidColorPrompt(prompt)
  for (const preset of SOLID_COLOR_PRESETS) {
    if (new RegExp(`\\b${preset.name.toLowerCase()}\\b`, 'i').test(normalized)) {
      return preset.color
    }
  }
  const hexMatch = normalized.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)
  if (hexMatch) {
    return hexMatch[0]
  }
  return null
}

export function solidColorLabel(color: string): string {
  const preset = SOLID_COLOR_PRESETS.find((entry) => entry.color.toLowerCase() === color.toLowerCase())
  return preset?.name ?? color
}
