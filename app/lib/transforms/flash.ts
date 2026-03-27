import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applyFlash(params: TransformParams): void {
  const { ctx, progress, x, y, w, h, prevEl, prevParams, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity, prevAnimationDuration, transitionColor } = params
  
  ctx.save()
  
  if (progress < 0.5) {
    if (prevEl && prevParams) {
      const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
      drawWithAnimation(
        { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh }, 
        prevEl, 
        prevAnimation ?? 'none', 
        prevAnimationProgress ?? 0, 
        prevElapsedTime ?? 0, 
        prevZoomIntensity ?? 0.5,
        prevAnimationDuration
      )
    }
    ctx.globalAlpha = Math.min(1, progress * 2)
  } else {
    ctx.globalAlpha = Math.max(0, (1 - progress) * 2)
  }
  
  ctx.fillStyle = transitionColor ?? '#FFFFFF'
  ctx.fillRect(x, y, w, h)
  
  ctx.restore()
}
