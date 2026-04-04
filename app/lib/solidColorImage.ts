export const SOLID_COLOR_PRESETS = [
  { color: '#ffffff', name: 'White' },
  { color: '#000000', name: 'Black' },
  { color: '#808080', name: 'Gray' },
  { color: '#ff0000', name: 'Red' },
  { color: '#00aa00', name: 'Green' },
  { color: '#0066ff', name: 'Blue' },
] as const

export function createSolidColorDataUrl(cssColor: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('createSolidColorDataUrl: 2d context unavailable')
  }
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 64, 64)
  return canvas.toDataURL('image/png')
}
