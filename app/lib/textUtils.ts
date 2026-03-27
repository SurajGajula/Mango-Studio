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
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  return lines
}
