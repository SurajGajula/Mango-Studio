import { TextClass } from '@/app/models/TextClass'
import { getKeyboardVisibleWordCount, wrapTextToLines } from '@/app/lib/textUtils'

export const TEXT_LINE_HEIGHT = 1.2
const LOGICAL_W = 1080
const LOGICAL_H = 1920

export function resolveCanvasFont(fontFamily: string): string {
  return fontFamily.split(',').map((f) => f.trim()).filter((f) => !f.startsWith('var(')).join(', ')
}

export interface TextContentRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TextOverlayLayout {
  lineCount: number
  lineHeightPx: number
  fontPx: number
  totalHeightPx: number
  firstLineOffsetPx: number
}

const TEXT_OUTLINE_SHADOW_OFFSET_EM = 0.04
const TEXT_OUTLINE_SHADOW_BLUR_EM = 0.08
const TEXT_OUTLINE_SHADOW_COLOR = 'rgba(0,0,0,0.8)'

function drawTextWithOutlineShadow(
  ctx: CanvasRenderingContext2D,
  fontPx: number,
  fillStyle: string,
  draw: () => void
): void {
  const blur = fontPx * TEXT_OUTLINE_SHADOW_BLUR_EM
  const offset = fontPx * TEXT_OUTLINE_SHADOW_OFFSET_EM
  const offsets: [number, number][] = [
    [-offset, -offset],
    [offset, -offset],
    [-offset, offset],
    [offset, offset],
  ]

  ctx.save()
  if (typeof ctx.filter === 'string') {
    ctx.filter = `blur(${blur}px)`
    ctx.fillStyle = TEXT_OUTLINE_SHADOW_COLOR
    for (const [ox, oy] of offsets) {
      ctx.save()
      ctx.translate(ox, oy)
      draw()
      ctx.restore()
    }
    ctx.filter = 'none'
  } else {
    ctx.shadowColor = TEXT_OUTLINE_SHADOW_COLOR
    ctx.shadowBlur = blur * 2
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.fillStyle = fillStyle
    draw()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }
  ctx.fillStyle = fillStyle
  draw()
  ctx.restore()
}

export function measureTextOverlayLayout(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: TextClass,
  xScale: number,
  content = text.content
): TextOverlayLayout {
  const fontPx = text.fontSize * xScale
  const lineHeightPx = fontPx * TEXT_LINE_HEIGHT
  ctx.font = `${text.fontWeight} ${fontPx}px ${resolveCanvasFont(text.fontFamily)}`
  const lines = wrapTextToLines(ctx, content || 'Text', text.width * xScale)
  const lineCount = Math.max(1, lines.length)
  const totalHeightPx = (lineCount - 1) * lineHeightPx + fontPx
  return {
    lineCount,
    lineHeightPx,
    fontPx,
    totalHeightPx,
    firstLineOffsetPx: fontPx * (TEXT_LINE_HEIGHT - 1) / 2,
  }
}

export function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  text: TextClass,
  cr: TextContentRect,
  currentTime: number
): void {
  const xScale = cr.width / LOGICAL_W
  const yScale = cr.height / LOGICAL_H
  const fontPx = text.fontSize * xScale
  const lineHeight = fontPx * TEXT_LINE_HEIGHT
  ctx.save()
  ctx.font = `${text.fontWeight} ${fontPx}px ${resolveCanvasFont(text.fontFamily)}`
  const content = text.content
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  const keyboardVisible =
    text.animation === 'keyboard' && words.length > 0
      ? getKeyboardVisibleWordCount(content, text.startTime, text.endTime, currentTime)
      : null
  const lines = wrapTextToLines(ctx, content, text.width * xScale)
  const textX =
    text.textAlign === 'center'
      ? cr.x + text.x * xScale + (text.width * xScale) / 2
      : text.textAlign === 'right'
        ? cr.x + text.x * xScale + text.width * xScale
        : cr.x + text.x * xScale
  const textY = cr.y + text.y * yScale
  const savedAlign = text.textAlign as CanvasTextAlign
  ctx.textAlign = savedAlign
  ctx.textBaseline = 'top'
  ctx.globalAlpha = text.opacity
  if (text.style === 'negative') {
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#ffffff'
  } else if (text.style === 'highlight') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000000'
    ctx.fillRect(cr.x + text.x * xScale, textY, text.width * xScale, lines.length * lineHeight)
    ctx.fillStyle = '#ffffff'
  } else {
    ctx.fillStyle = text.color
  }
  const drawTextLines = () => {
    if (keyboardVisible === null) {
      lines.forEach((line, i) => ctx.fillText(line, textX, textY + i * lineHeight))
      return
    }
    ctx.textAlign = 'left'
    let nextWordIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const y = textY + i * lineHeight
      const parts = line.split(' ')
      const partWordIndex = parts.map((w) => (w === '' ? null : nextWordIndex++))
      const lineWidth = ctx.measureText(line).width
      const startX =
        savedAlign === 'center' ? textX - lineWidth / 2 : savedAlign === 'right' ? textX - lineWidth : textX
      let x = startX
      for (let p = 0; p < parts.length; p++) {
        const w = parts[p]
        if (p > 0) {
          let j = p
          while (j < parts.length && parts[j] === '') j++
          const spVis = j < parts.length && partWordIndex[j] !== null && partWordIndex[j]! < keyboardVisible
          const sp = ' '
          const spW = ctx.measureText(sp).width
          if (spVis) ctx.fillText(sp, x, y)
          x += spW
        }
        if (w !== '' && partWordIndex[p] !== null) {
          if (partWordIndex[p]! < keyboardVisible) {
            ctx.fillText(w, x, y)
          }
          x += ctx.measureText(w).width
        }
      }
    }
    ctx.textAlign = savedAlign
  }
  const drawStyledText = () => {
    if (text.style === 'normal') {
      drawTextWithOutlineShadow(ctx, fontPx, text.color, drawTextLines)
      return
    }
    drawTextLines()
  }
  const drawWithOptionalShake = () => {
    if (text.animation !== 'shake') {
      drawStyledText()
      return
    }
    const duration = Math.max(0.001, text.endTime - text.startTime)
    const localTime = Math.max(0, currentTime - text.startTime)
    const normalized = Math.min(1, localTime / duration)
    const envelope = 0.6 + 0.4 * Math.sin(normalized * Math.PI)
    const angle = localTime * 2 * Math.PI
    const shiftX = Math.sin(angle * 2.0) * 0.06 * fontPx * envelope
    const shiftY = Math.cos(angle * 2.3) * 0.04 * text.fontSize * yScale * envelope
    const rotate = Math.sin(angle * 1.6) * 0.9 * envelope * (Math.PI / 180)
    const centerX = cr.x + text.x * xScale + (text.width * xScale) / 2
    const centerY = textY + (lines.length * lineHeight) / 2
    ctx.save()
    ctx.translate(centerX + shiftX, centerY + shiftY)
    ctx.rotate(rotate)
    ctx.translate(-centerX, -centerY)
    drawStyledText()
    ctx.restore()
  }
  drawWithOptionalShake()
  ctx.restore()
}

export async function preloadTextFonts(texts: TextClass[]): Promise<void> {
  const fontSpecs = new Set(
    texts.map((t) => `${t.fontWeight} 72px ${resolveCanvasFont(t.fontFamily)}`)
  )
  await Promise.all([...fontSpecs].map((spec) => document.fonts.load(spec).catch(() => {})))
}
