import type { TransformParams } from './types'

export function applyStretchOutAnimation(params: TransformParams): void {
  const {
    ctx,
    imgEl,
    x,
    y,
    w,
    h,
    sx,
    sy,
    sw,
    sh,
    elapsedTime,
    itemDuration,
    animationDuration,
  } = params

  const itemDur = itemDuration && itemDuration > 0 ? itemDuration : undefined
  const requestedDur = animationDuration && animationDuration > 0 ? animationDuration : itemDur ?? 1
  const dur = itemDur ? Math.min(requestedDur, itemDur) : requestedDur

  const u = dur > 0 ? Math.max(0, Math.min(1, elapsedTime / dur)) : 0
  const eased = u * u * u

  const stretchX = 1 + 0.025 * u + 0.24 * eased
  const stretchY = 1 + 0.006 * u + 0.03 * eased
  const cx = x + w / 2
  const cy = y + h / 2

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.scale(stretchX, stretchY)
  ctx.translate(-cx, -cy)
  ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}
