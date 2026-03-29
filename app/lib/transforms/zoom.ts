import type { TransformParams } from './types'

const PULSE_PEAK_U = 0.75

function pulseZoomT(u: number): number {
  const p = PULSE_PEAK_U
  if (u <= p) {
    return (u * (2 * p - u)) / (p * p)
  }
  const oneMinusP = 1 - p
  return (-(2 * p - 1) + 2 * p * u - u * u) / (oneMinusP * oneMinusP)
}

export function applyStandardZoom(params: TransformParams): void {
  const { ctx, animation, progress, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, itemDuration, elapsedTime } = params
  
  let t = 0
  if (animation === 'pulse') {
    let totalDur = itemDuration || 1.0
    if (progress > 0.01 && progress < 0.99 && elapsedTime > 0) {
      const derivedDur = elapsedTime / progress
      if (derivedDur > 0.1) totalDur = derivedDur
    }
    const u =
      totalDur > 0
        ? Math.min(1, Math.max(0, elapsedTime / totalDur))
        : 0
    t = pulseZoomT(u)
  }

  const scale = 1 + t * zoomIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2

  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
