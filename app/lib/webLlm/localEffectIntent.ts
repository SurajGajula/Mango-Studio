import type { AddEffectInstruction } from '@/app/lib/chatRouteTypes'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'

const EFFECT_ALIASES: Record<string, AddEffectInstruction['type']> = {
  'crt-dither': 'crt-dither',
  'crt dither': 'crt-dither',
  grainy: 'grainy',
  'black-and-white': 'black-and-white',
  'black and white': 'black-and-white',
  contrast: 'contrast',
  'vivid-sharp': 'vivid-sharp',
  'vivid sharp': 'vivid-sharp',
  'pixel-glitch-scan': 'pixel-glitch-scan',
  'pixel glitch scan': 'pixel-glitch-scan',
  'blur-vignette': 'blur-vignette',
  'blur vignette': 'blur-vignette',
  'cool-tone': 'cool-tone',
  'cool tone': 'cool-tone',
  cool: 'cool-tone',
  vignette: 'flashing-black-vignette',
  'flashing-black-vignette': 'flashing-black-vignette',
  'flashing black vignette': 'flashing-black-vignette',
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function resolveLocalEffectIntent(prompt: string): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const match = normalized.match(
    /\badd\s+(crt[- ]?dither|grainy|black[- ]?and[- ]?white|contrast|vivid[- ]?sharp|pixel[- ]?glitch[- ]?scan|blur[- ]?vignette|cool[- ]?tone|cool|flashing[- ]?black[- ]?vignette|vignette)\s+(?:effect\s+)?from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/
  )
  if (!match) {
    return null
  }

  const effectKey = match[1].replace(/\s+/g, ' ').trim()
  const effectType = EFFECT_ALIASES[effectKey] ?? EFFECT_ALIASES[effectKey.replace(/-/g, ' ')]
  if (!effectType) {
    return null
  }

  const startTime = Number.parseFloat(match[2])
  const endTime = Number.parseFloat(match[3])
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return { action: 'no_op', message: 'Effect end time must be after start time.' }
  }

  const effect: AddEffectInstruction = { type: effectType, startTime, endTime }
  return {
    action: 'add_effect',
    newEffects: [effect],
    message: `Added ${effectType} from ${startTime}s to ${endTime}s.`,
  }
}
