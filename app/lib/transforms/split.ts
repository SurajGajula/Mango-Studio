import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

let scratchCanvas: HTMLCanvasElement | null = null

export function applySplit(params: TransformParams): void {
  const { ctx, transition, progress, x, y, w, h, prevEl, prevParams, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity } = params
  
  if (prevEl && prevParams && progress < 1) {
    const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
    const t = Math.max(0, Math.min(1, progress)) // Clamp progress
    
    // Create or resize scratch canvas if needed
    if (!scratchCanvas) {
      scratchCanvas = document.createElement('canvas')
    }
    if (scratchCanvas.width !== Math.ceil(pw) || scratchCanvas.height !== Math.ceil(ph)) {
      scratchCanvas.width = Math.ceil(pw)
      scratchCanvas.height = Math.ceil(ph)
    }
    
    const sCtx = scratchCanvas.getContext('2d')
    if (!sCtx) return
    
    sCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height)
    
    // Draw prevEl with its animation onto scratch canvas
    // We pass (0, 0, pw, ph) as the destination since it's a scratch canvas
    drawWithAnimation(
      { ...params, ctx: sCtx, x: 0, y: 0, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh, flipHorizontal: params.prevFlipHorizontal, flipVertical: params.prevFlipVertical },
      prevEl,
      prevAnimation ?? 'none',
      prevAnimationProgress ?? 0,
      prevElapsedTime ?? 0,
      prevZoomIntensity ?? 0.5,
      params.prevAnimationDuration
    )

    // Use cubic easing for a smoother, more natural slide
    const ease = t * t * (3 - 2 * t)

    if (params.transitionAxis === 'vertical') {
      const halfW = pw / 2
      
      // Ensure pieces move far enough to clear the reveal target's entire width
      const totalShift = Math.max(0, (px - x) + halfW, (x + w) - (px + halfW))
      const shift = totalShift * ease
      
      // Left half
      ctx.drawImage(scratchCanvas, 0, 0, halfW, ph, px - shift, py, halfW, ph)
      // Right half
      ctx.drawImage(scratchCanvas, halfW, 0, halfW, ph, px + halfW + shift, py, halfW, ph)
    } else {
      const halfH = ph / 2
      
      // Ensure pieces move far enough to clear the reveal target's entire height
      const totalShift = Math.max(0, (py - y) + halfH, (y + h) - (py + halfH))
      const shift = totalShift * ease
      
      // Top half
      ctx.drawImage(scratchCanvas, 0, 0, pw, halfH, px, py - shift, pw, halfH)
      // Bottom half
      ctx.drawImage(scratchCanvas, 0, halfH, pw, halfH, px, py + halfH + shift, pw, halfH)
    }
    ctx.restore()
  }
}
