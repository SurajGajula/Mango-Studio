const GENERATION_PATTERN =
  /\b(generate|create|make|draw|render)\b[\s\S]{0,40}\b(image|images|video|videos|clip|clips|speech|voiceover|voice over|narration|photo|picture|animation)\b/i

const SOLID_COLOR_PATTERN =
  /\b(?:white|black|gray|grey|red|green|blue|#[0-9a-f]{3,8})\b/i

const TRANSCRIBE_PATTERN = /\b(transcribe|transcription|caption|captions|subtitle|subtitles)\b/i

const TALKING_ANIMATION_PATTERN = /\b(animate|lip[- ]?sync|talking)\b[\s\S]{0,30}\b(speech|audio|video|image)\b/i

function isSolidShapeTimelineRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase()
  if (!SOLID_COLOR_PATTERN.test(prompt)) {
    return false
  }
  if (/\b(?:shape|shapes|solid)\b/.test(normalized)) {
    return true
  }
  if (/\b(?:replace|swap|substitute|change)\b/.test(normalized)) {
    return true
  }
  if (/\b(?:image|images|video|videos)\s+\d/.test(normalized)) {
    return true
  }
  if (/\blength\s+of\s+(?:image|images|video|videos)\s+\d/.test(normalized)) {
    return true
  }
  return false
}

export function getLocalUnsupportedPromptReason(prompt: string): string | null {
  const trimmed = prompt.trim()
  if (trimmed.length === 0) {
    return 'Prompt is empty.'
  }

  if (GENERATION_PATTERN.test(trimmed) && !isSolidShapeTimelineRequest(trimmed)) {
    return 'Local mode does not support image, video, or speech generation. Switch to cloud chat for that.'
  }

  if (TRANSCRIBE_PATTERN.test(trimmed)) {
    return 'Local mode does not support transcription or captions. Switch to cloud chat for that.'
  }

  if (TALKING_ANIMATION_PATTERN.test(trimmed)) {
    return 'Local mode does not support talking animation. Switch to cloud chat for that.'
  }

  return null
}
