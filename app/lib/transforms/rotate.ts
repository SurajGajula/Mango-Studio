import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applyRotate(params: TransformParams): void {
  const { ctx, progress, imgEl, animation, elapsedTime, zoomIntensity, animationDuration, x, y, w, h, prevEl, prevParams, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity, prevAnimationDuration } = params
  
  if (!prevEl || !prevParams) {
    drawWithAnimation(params, imgEl, animation ?? 'none', progress, elapsedTime, zoomIntensity, animationDuration)
    return
  }

  const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
  
  const centerX = x + w / 2
  const centerY = y + h / 2
  const pCenterX = px + pw / 2
  const pCenterY = py + ph / 2

  // Use a smooth easing for the transition
  const t = Math.max(0, Math.min(1, progress))
  const ease = t * t * (3 - 2 * t)
  
  // The total rotation goes from 0 to 360 degrees (2 * PI)
  const currentAngle = ease * 2 * Math.PI

  // 1. Draw the "Base" background.
  // We draw the incoming item first as a non-moving background to fill any potential slivers.
  ctx.save()
  drawWithAnimation(params, imgEl, animation ?? 'none', 1.0, elapsedTime, zoomIntensity, animationDuration)
  ctx.restore()

  ctx.save()

  if (ease < 0.5) {
    ctx.translate(pCenterX, pCenterY)
    ctx.rotate(currentAngle)
    ctx.translate(-pCenterX, -pCenterY)
    
    drawWithAnimation(
      { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh },
      prevEl,
      prevAnimation ?? 'none',
      prevAnimationProgress ?? 0,
      prevElapsedTime ?? 0,
      prevZoomIntensity ?? 0.5,
      prevAnimationDuration
    )
  } else {
    ctx.translate(centerX, centerY)
    ctx.rotate(currentAngle)
    ctx.translate(-centerX, -centerY)
    
    drawWithAnimation(params, imgEl, animation ?? 'none', progress, elapsedTime, zoomIntensity, animationDuration)
  }

  ctx.restore()
}
