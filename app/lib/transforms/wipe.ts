import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'
import { easedTransitionProgress } from './transitionEasing'

export function applyWipe(params: TransformParams): void {
  const { ctx, progress, imgEl, animation, elapsedTime, zoomIntensity, x, y, w, h, transitionDirection, transitionWipeEasing } = params
  const ease = Math.max(0, Math.min(1, easedTransitionProgress(progress, transitionWipeEasing)))

  let revealX = x
  let revealY = y
  let revealW = w
  let revealH = h
  if (transitionDirection === 'right') {
    revealW = w * ease
  } else if (transitionDirection === 'left') {
    revealW = w * ease
    revealX = x + w - revealW
  } else if (transitionDirection === 'down' || transitionDirection === 'bottom') {
    revealH = h * ease
  } else {
    revealH = h * ease
    revealY = y + h - revealH
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(revealX, revealY, revealW, revealH)
  ctx.clip()
  drawWithAnimation(params, imgEl, animation ?? 'none', progress, elapsedTime, zoomIntensity)
  ctx.restore()
}
