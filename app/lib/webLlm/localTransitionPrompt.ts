export function normalizeLocalPrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function promptIsTransitionRemoval(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  if (!/\b(?:remove|clear|delete|strip)\b/.test(normalized)) {
    return false
  }
  return /\b(?:transitions?|animations?|fade|flash|wipe|morph|split|slide-in|circle|rotate)\b/.test(
    normalized
  )
}

export function promptIsTransitionEdit(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  if (promptIsTransitionRemoval(prompt)) {
    return true
  }
  if (!/\b(?:add|apply|set)\b/.test(normalized)) {
    return false
  }
  return /\b(?:transitions?|fade|flash|wipe|morph|split|slide-in|circle|rotate)\b/.test(
    normalized
  )
}

export function promptIsMotionEdit(prompt: string): boolean {
  if (promptIsTransitionEdit(prompt)) {
    return true
  }
  const normalized = normalizeLocalPrompt(prompt)
  if (/\b(?:remove|clear|delete|strip)\b/.test(normalized) && /\banimations?\b/.test(normalized)) {
    return true
  }
  if (!/\b(?:add|apply|set)\b/.test(normalized)) {
    return /\banimation\s+duration\b/.test(normalized) ||
      /\btransition\s+duration\b/.test(normalized) ||
      /\bintensity\s+to\b/.test(normalized)
  }
  return /\b(?:zoom(?:\s|-)?in|zoom(?:\s|-)?out|stretch(?:\s|-)?out|shake|jitter|rotate|slide(?:\s|-)?shake|animation\s+duration|transition\s+duration|intensity)\b/.test(
    normalized
  )
}

export function promptIsTimelineItemDeletion(prompt: string): boolean {
  const normalized = normalizeLocalPrompt(prompt)
  if (!/\b(?:delete|remove|clear)\b/.test(normalized)) {
    return false
  }
  if (promptIsTransitionRemoval(prompt)) {
    return false
  }
  return /\b(?:image|images|video|videos|audio|audios|text|texts|effect|effects|clip|clips)\b/.test(
    normalized
  )
}
