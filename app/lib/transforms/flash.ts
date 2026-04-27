import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applyFlash(params: TransformParams): void {
  const {
    ctx,
    progress,
    x,
    y,
    w,
    h,
    prevEl,
    prevParams,
    prevAnimation,
    prevAnimationProgress,
    prevElapsedTime,
    prevZoomIntensity,
    prevItemDuration,
    prevAnimationDuration,
    prevZoomDistanceIntensity,
    transitionColor,
    transitionFlashMode
  } = params
  
  ctx.save()
  const flashAlpha = progress < 0.5 ? Math.min(1, progress * 2) : Math.max(0, (1 - progress) * 2)
  
  if (prevEl && prevParams && progress < 0.5) {
    const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
    drawWithAnimation(
      { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh },
      prevEl,
      prevAnimation ?? 'none',
      prevAnimationProgress ?? 0,
      prevElapsedTime ?? 0,
      prevZoomIntensity ?? 0.5,
      prevItemDuration,
      prevAnimationDuration,
      prevZoomDistanceIntensity ?? 1
    )
  }

  ctx.globalAlpha = flashAlpha
  if (transitionFlashMode === 'negative' && prevEl && prevParams) {
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#FFFFFF'
  } else {
    ctx.fillStyle = transitionColor ?? '#FFFFFF'
  }
  ctx.fillRect(x, y, w, h)
  
  ctx.restore()
}
