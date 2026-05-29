export function getKeyboardVisibleWordCount(
  content: string,
  startTime: number,
  endTime: number,
  t: number
): number {
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  const duration = endTime - startTime
  if (words.length === 0) return 0
  if (duration <= 0) return words.length
  const wordDuration = duration / words.length
  const elapsed = t - startTime
  return Math.max(1, Math.min(words.length, Math.floor(elapsed / wordDuration) + 1))
}

export function getKeyboardVisibleContent(
  content: string,
  startTime: number,
  endTime: number,
  t: number
): string {
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return content
  const visibleCount = getKeyboardVisibleWordCount(content, startTime, endTime, t)
  return words.slice(0, visibleCount).join(' ')
}

function breakWordToFit(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  word: string,
  maxWidth: number
): string[] {
  if (ctx.measureText(word).width <= maxWidth) return [word]
  const parts: string[] = []
  let current = ''
  for (const ch of word) {
    const next = current + ch
    if (ctx.measureText(next).width > maxWidth && current) {
      parts.push(current)
      current = ch
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts.length > 0 ? parts : [word]
}

export function wrapTextToLines(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let current = ''
    for (const word of words) {
      const wordParts = breakWordToFit(ctx, word, maxWidth)
      for (const part of wordParts) {
        const candidate = current ? `${current} ${part}` : part
        if (ctx.measureText(candidate).width > maxWidth && current) {
          lines.push(current)
          current = part
        } else {
          current = candidate
        }
      }
    }
    lines.push(current)
  }
  return lines
}
