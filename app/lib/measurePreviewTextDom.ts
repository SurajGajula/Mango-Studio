import { TextClass } from '@/app/models/TextClass'

const TEXT_LINE_HEIGHT = 1.2

function resolveCanvasFont(fontFamily: string): string {
  return fontFamily.split(',').map((f) => f.trim()).filter((f) => !f.startsWith('var(')).join(', ')
}

type MeasureText = Pick<TextClass, 'fontSize' | 'fontWeight' | 'fontFamily' | 'width' | 'textAlign'>

let measureEl: HTMLDivElement | null = null

export function measurePreviewTextDomHeight(
  content: string,
  text: MeasureText,
  xScale: number
): number {
  if (typeof document === 'undefined') return 0
  if (!measureEl) {
    measureEl = document.createElement('div')
    measureEl.style.position = 'absolute'
    measureEl.style.left = '-10000px'
    measureEl.style.top = '0'
    measureEl.style.visibility = 'hidden'
    measureEl.style.pointerEvents = 'none'
    measureEl.style.whiteSpace = 'pre-wrap'
    measureEl.style.wordBreak = 'break-word'
    measureEl.style.boxSizing = 'border-box'
    measureEl.style.padding = '0'
    measureEl.style.margin = '0'
    measureEl.style.border = '0'
    document.body.appendChild(measureEl)
  }
  measureEl.style.width = `${text.width * xScale}px`
  measureEl.style.fontSize = `${text.fontSize * xScale}px`
  measureEl.style.fontWeight = String(text.fontWeight)
  measureEl.style.fontFamily = resolveCanvasFont(text.fontFamily)
  measureEl.style.lineHeight = String(TEXT_LINE_HEIGHT)
  measureEl.style.textAlign = text.textAlign
  measureEl.textContent = content || 'Text'
  return measureEl.scrollHeight
}

export function measurePreviewTextLogicalHeight(
  content: string,
  text: MeasureText,
  yScale: number
): number {
  if (yScale <= 0) return text.fontSize * TEXT_LINE_HEIGHT
  return measurePreviewTextDomHeight(content, text, yScale) / yScale
}
