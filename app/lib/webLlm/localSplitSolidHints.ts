import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function promptLooksLikeSplit(prompt: string): boolean {
  return /\bsplit\b/.test(normalizePrompt(prompt))
}

export function promptLooksLikeSolidOrMediaReplace(
  prompt: string,
  uploadedFiles?: LocalUploadedFileMeta[]
): boolean {
  const normalized = normalizePrompt(prompt)
  if (uploadedFiles && uploadedFiles.length > 0 && /\b(?:replace|swap)\b/.test(normalized)) {
    return true
  }
  if (
    /\b(?:white|black|gray|grey|red|green|blue|#[0-9a-f]{3,8}|solid|shape|shapes)\b/i.test(prompt)
  ) {
    return /\b(?:replace|swap|make|add|insert|place|change)\b/.test(normalized)
  }
  return false
}

export function buildSplitSolidRoutingHints(
  prompt: string,
  uploadedFiles?: LocalUploadedFileMeta[]
): string {
  const sections: string[] = []

  if (promptLooksLikeSplit(prompt)) {
    sections.push(
      [
        'Split recipe:',
        '- Expand ranges and lists: "images 2-9" means image #2 through #9 inclusive.',
        '- Emit one splits[] entry per target item using the exact manifest id.',
        '- times are absolute timeline seconds strictly between the item start and end.',
        '- Images/texts/audios: start=startTime, end=endTime, span=end-start.',
        '- Videos: start=timestamp, end=timestamp+duration, span=duration.',
        '- Equal parts N ("into N", "into N parts", "in half" => N=2): times = [start+span*1/N, start+span*2/N, ..., start+span*(N-1)/N].',
        '- Never invent ids. Never return an empty splits array.',
      ].join('\n')
    )
  }

  if (promptLooksLikeSolidOrMediaReplace(prompt, uploadedFiles)) {
    sections.push(
      [
        'Solid / media replace recipe:',
        '- replace_with_solid: overwrite existing image/video clips with a shape color. One replacements[] entry per target id.',
        '- Colors: white #ffffff, black #000000, gray #808080, red #ff0000, green #00aa00, blue #0066ff.',
        '- "every other" / alternating => odd 1-based numbers (#1, #3, #5, ...).',
        '- Ranges/lists/all => include every matching manifest id.',
        '- add_solid_image: add ONE new solid clip. "make a white image the length of images 1-4" uses startTime of image #1 and endTime of image #4. Do not replace existing clips.',
        '- replace_images: only when files are attached. One uploaded file can map to every target (fileIndex 0).',
      ].join('\n')
    )
  }

  if (sections.length === 0) {
    return ''
  }
  return `\n\n${sections.join('\n\n')}`
}
