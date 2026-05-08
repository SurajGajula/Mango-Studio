import type { TransformParams } from './types'
import { easedTransitionProgress } from './transitionEasing'

const SLIDE_SHAKE_INTENSITY = 0.1

export function applySlideShake(params: TransformParams): void {
  const { animation, animationDuration, ctx, elapsedTime, w, x, y } = params
  const itemDuration = Math.max(0.1, params.itemDuration ?? animationDuration ?? 1)
  const slideDuration = Math.max(0.1, Math.min(animationDuration ?? 1, itemDuration / 2))
  const offscreenOffset = animation === 'slide-shake-right' ? ctx.canvas.width - x : -x - w
  const slideOutStart = Math.max(slideDuration, itemDuration - slideDuration)
  const entranceProgress = Math.min(1, elapsedTime / slideDuration)
  const exitProgress = elapsedTime >= slideOutStart ? Math.min(1, (elapsedTime - slideOutStart) / slideDuration) : 0
  const offsetX =
    elapsedTime < slideDuration
      ? offscreenOffset * (1 - easedTransitionProgress(entranceProgress, 'smooth'))
      : offscreenOffset * easedTransitionProgress(exitProgress, 'smooth')

  drawSlideShakeFrame(params, x + offsetX, y, elapsedTime >= slideDuration && elapsedTime < slideOutStart)
}

function drawSlideShakeFrame(params: TransformParams, dx: number, dy: number, shouldShake: boolean): void {
  const { ctx, imgEl, w, h, sx, sy, sw, sh, elapsedTime } = params
  const scale = 1.15
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const maxShiftX = (sw - zoomedSw) / 2
  const maxShiftY = (sh - zoomedSh) / 2
  const centerSx = sx + maxShiftX
  const centerSy = sy + maxShiftY
  const destCx = dx + w / 2
  const destCy = dy + h / 2
  const time = elapsedTime * 2.5
  const angle = time * 2 * Math.PI
  const shakeIntensity = shouldShake ? 0.15 * SLIDE_SHAKE_INTENSITY : 0
  const shakeX = Math.sin(angle * 0.8) * maxShiftX * shakeIntensity
  const shakeY = Math.cos(angle * 0.9) * maxShiftY * shakeIntensity
  const rotAmplitude = shouldShake ? (2.2 * (Math.PI / 180)) * SLIDE_SHAKE_INTENSITY : 0
  const rotAngle = Math.sin(angle * 1.2) * rotAmplitude
  const coverScale = Math.cos(rotAmplitude) + Math.max(w / h, h / w) * Math.sin(rotAmplitude)
  const dw = w * coverScale
  const dh = h * coverScale

  ctx.save()
  ctx.translate(destCx, destCy)
  ctx.rotate(rotAngle)
  ctx.drawImage(imgEl, centerSx + shakeX, centerSy + shakeY, zoomedSw, zoomedSh, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}
