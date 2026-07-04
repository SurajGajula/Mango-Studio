export type LocalManifestSection = 'image' | 'video' | 'text' | 'audio' | 'effect'

export type SectionItemFilter = number[] | 'all'

export type PromptManifestFilter = {
  sections: Set<LocalManifestSection>
  itemNumbers: Partial<Record<LocalManifestSection, SectionItemFilter>>
}

const SECTION_ALIASES: Record<LocalManifestSection, string[]> = {
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures'],
  video: ['video', 'videos', 'clip', 'clips'],
  text: ['text', 'texts', 'caption', 'captions', 'subtitle', 'subtitles', 'title', 'titles'],
  audio: ['audio', 'audios', 'sound', 'sounds', 'music', 'soundtrack', 'soundtracks'],
  effect: ['effect', 'effects'],
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

function aliasPattern(section: LocalManifestSection): string {
  return SECTION_ALIASES[section].join('|')
}

function promptMentionsSection(normalized: string, section: LocalManifestSection): boolean {
  return new RegExp(`\\b(?:${aliasPattern(section)})\\b`, 'i').test(normalized)
}

function isAllItemsPattern(normalized: string, section: LocalManifestSection): boolean {
  return new RegExp(`\\b(?:all|every)\\s+(?:the\\s+)?(?:${aliasPattern(section)})\\b`, 'i').test(
    normalized
  )
}

function parseRangeForSection(normalized: string, section: LocalManifestSection): number[] | null {
  const match = normalized.match(
    new RegExp(
      `\\b(?:${aliasPattern(section)})\\s*(\\d+)\\s*(?:to|through|-)\\s*(\\d+)\\b`,
      'i'
    )
  )
  if (!match) {
    return null
  }
  const start = Number.parseInt(match[1], 10)
  const end = Number.parseInt(match[2], 10)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function parseNumbersNearSection(normalized: string, section: LocalManifestSection): number[] {
  const numbers = new Set<number>()
  const nearKindRegex = new RegExp(`\\b(?:${aliasPattern(section)})\\s*(\\d+)\\b`, 'gi')
  for (const match of normalized.matchAll(nearKindRegex)) {
    const itemNumber = Number.parseInt(match[1], 10)
    if (Number.isFinite(itemNumber) && itemNumber >= 1) {
      numbers.add(itemNumber)
    }
  }
  return [...numbers]
}

function parseAndConjoinedNumbers(normalized: string): number[] {
  const numbers = new Set<number>()
  for (const match of normalized.matchAll(/\b(\d+)\s+and\s+(\d+)\b/g)) {
    const first = Number.parseInt(match[1], 10)
    const second = Number.parseInt(match[2], 10)
    if (Number.isFinite(first) && first >= 1) {
      numbers.add(first)
    }
    if (Number.isFinite(second) && second >= 1) {
      numbers.add(second)
    }
  }
  return [...numbers]
}

function parseCommaSeparatedAfterSection(
  normalized: string,
  section: LocalManifestSection
): number[] {
  const match = normalized.match(
    new RegExp(`\\b(?:${aliasPattern(section)})\\s+([\\d,\\s]+)`, 'i')
  )
  if (!match) {
    return []
  }
  return match[1]
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value) && value >= 1)
}

function itemNumbersForSection(normalized: string, section: LocalManifestSection): SectionItemFilter | null {
  if (isAllItemsPattern(normalized, section)) {
    return 'all'
  }

  const range = parseRangeForSection(normalized, section)
  if (range) {
    return range
  }

  const numbers = new Set<number>()
  for (const value of parseNumbersNearSection(normalized, section)) {
    numbers.add(value)
  }
  for (const value of parseCommaSeparatedAfterSection(normalized, section)) {
    numbers.add(value)
  }
  if (promptMentionsSection(normalized, section)) {
    for (const value of parseAndConjoinedNumbers(normalized)) {
      numbers.add(value)
    }
  }

  if (numbers.size === 0) {
    return null
  }
  return [...numbers].sort((a, b) => a - b)
}

export function resolvePromptItemNumbers(
  prompt: string,
  section: LocalManifestSection
): SectionItemFilter | null {
  return itemNumbersForSection(normalizePrompt(prompt), section)
}

export function parsePromptManifestFilter(prompt: string): PromptManifestFilter {
  const normalized = normalizePrompt(prompt)
  const sections = new Set<LocalManifestSection>()
  for (const section of Object.keys(SECTION_ALIASES) as LocalManifestSection[]) {
    if (promptMentionsSection(normalized, section)) {
      sections.add(section)
    }
  }

  if (sections.size === 0) {
    sections.add('image')
    sections.add('video')
  }

  const itemNumbers: Partial<Record<LocalManifestSection, SectionItemFilter>> = {}
  for (const section of sections) {
    const numbers = itemNumbersForSection(normalized, section)
    if (numbers) {
      itemNumbers[section] = numbers
    }
  }

  return { sections, itemNumbers }
}

export function promptNeedsAudioMarks(prompt: string): boolean {
  const normalized = normalizePrompt(prompt)
  return /\b(?:split|mark|marks)\b/.test(normalized) && promptMentionsSection(normalized, 'audio')
}
