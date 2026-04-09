export const SOLID_COLOR_PRESETS = [
  { color: '#ffffff', name: 'White' },
  { color: '#000000', name: 'Black' },
  { color: '#808080', name: 'Gray' },
  { color: '#ff0000', name: 'Red' },
  { color: '#00aa00', name: 'Green' },
  { color: '#0066ff', name: 'Blue' },
] as const

export type SolidShapeKind = 'square' | 'circle' | 'arrow'

export function createSolidShapeDataUrl(cssColor: string, shape: SolidShapeKind): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('createSolidShapeDataUrl: 2d context unavailable')
  }
  ctx.fillStyle = cssColor
  if (shape === 'square') {
    ctx.fillRect(0, 0, 64, 64)
  } else if (shape === 'circle') {
    ctx.beginPath()
    ctx.arc(32, 32, 30, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(6, 32)
    ctx.lineTo(38, 10)
    ctx.lineTo(38, 22)
    ctx.lineTo(58, 22)
    ctx.lineTo(58, 42)
    ctx.lineTo(38, 42)
    ctx.lineTo(38, 54)
    ctx.closePath()
    ctx.fill()
  }
  return canvas.toDataURL('image/png')
}

export function createSolidColorDataUrl(cssColor: string): string {
  return createSolidShapeDataUrl(cssColor, 'square')
}
