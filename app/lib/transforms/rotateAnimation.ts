import type { TransformParams } from './types'

export function applyRotateAnimation(params: TransformParams): void {
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
  const angle = u * 2 * Math.PI

  // Clip so the rotated frame stays within the item bounds.
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  const cx = x + w / 2
  const cy = y + h / 2

  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.translate(-cx, -cy)

  ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

