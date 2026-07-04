import type { TransformParams } from './types'

function drawJitterEdgeFill(
  ctx: CanvasRenderingContext2D,
  imgEl: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const blurPx = Math.max(4, Math.min(w, h) * 0.025)

  ctx.save()
  if (typeof ctx.filter === 'string') {
    ctx.filter = `blur(${blurPx}px)`
  }
  ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
  ctx.filter = 'none'
  ctx.restore()
}

export function applyJitter(params: TransformParams): void {
  const { ctx, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, elapsedTime, animationDuration, itemDuration } = params

  const jitterDuration = animationDuration ?? itemDuration ?? 0.4
  const maxShiftX = w * 0.08 * zoomIntensity
  const maxShiftY = h * 0.08 * zoomIntensity

  if (elapsedTime < jitterDuration + 0.001) {
    const t = elapsedTime / jitterDuration
    const fade = 0.82 + 0.18 * Math.sin(t * Math.PI)
    const base = elapsedTime * Math.PI * 2

    const jitterX =
      (Math.sin(base * 5.3 + 0.4) * 0.5 +
        Math.sin(base * 8.7 + 1.7) * 0.32 +
        Math.sin(base * 3.9 + 2.9) * 0.18) *
      fade *
      maxShiftX
    const jitterY =
      (Math.sin(base * 4.8 + 1.1) * 0.48 +
        Math.cos(base * 7.4 + 0.6) * 0.34 +
        Math.sin(base * 11.2 + 3.2) * 0.18) *
      fade *
      maxShiftY

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    drawJitterEdgeFill(ctx, imgEl, sx, sy, sw, sh, x, y, w, h)
    ctx.drawImage(imgEl, sx, sy, sw, sh, x + jitterX, y + jitterY, w, h)
    ctx.restore()
  } else {
    ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
  }
}
