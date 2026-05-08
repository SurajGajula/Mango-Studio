import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applyFade(params: TransformParams): void {
  const { ctx, progress, prevEl, prevParams, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity } = params
  
  if (prevEl && prevParams && progress < 1) {
    const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
    
    ctx.save()
    // Smooth cross-fade by drawing previous item with fading alpha on top of the already-drawn next item
    const ease = progress * progress * (3 - 2 * progress)
    ctx.globalAlpha = Math.max(0, 1 - ease)
    
    drawWithAnimation(
      { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh, flipHorizontal: params.prevFlipHorizontal, flipVertical: params.prevFlipVertical },
      prevEl,
      prevAnimation ?? 'none',
      prevAnimationProgress ?? 0,
      prevElapsedTime ?? 0,
      prevZoomIntensity ?? 0.5,
      params.prevAnimationDuration
    )
    ctx.restore()
  }
}
