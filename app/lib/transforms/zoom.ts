import type { TransformParams } from './types'

export function applyStandardZoom(params: TransformParams): void {
  const { ctx, animation, progress, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity } = params
  
  const t = animation === 'in' ? progress : 1 - progress
  const scale = 1 + t * zoomIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2

  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
