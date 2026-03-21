import type { TransformParams } from './types'

export function applyJitter(params: TransformParams): void {
  const { ctx, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, elapsedTime, animationDuration } = params
  
  const jitterDuration = animationDuration ?? 0.4
  // Dynamically link scale to intensity. 
  // 0% intensity = 1.0x zoom. 100% intensity = 2.5x zoom.
  const scale = 1.0 + (zoomIntensity * 1.5)
  
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const maxShiftX = (sw - zoomedSw) / 2
  const maxShiftY = (sh - zoomedSh) / 2
  const centerSx = sx + maxShiftX
  const centerSy = sy + maxShiftY

  if (elapsedTime < jitterDuration + 0.001) {
    const t = elapsedTime / jitterDuration
    const pulse = Math.sin(t * Math.PI)
    
    // Cardinal oscillations (no rotation)
    // Higher frequencies for a violent, frantic jitter
    const freqX1 = 32; const freqY1 = 28
    const freqX2 = 12; const freqY2 = 10
    
    // The movement force is naturally constrained by the available "buffer" (maxShiftX/Y)
    // which is now strictly tied to the zoom scale.
    const shakeX = (Math.sin(t * Math.PI * freqX1) * 0.6 + Math.sin(t * Math.PI * freqX2) * 0.4) * pulse * maxShiftX
    const shakeY = (Math.cos(t * Math.PI * freqY1) * 0.6 + Math.cos(t * Math.PI * freqY2) * 0.4) * pulse * maxShiftY

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    // Directly draw using the calculated cardinal offsets
    ctx.drawImage(imgEl, centerSx + shakeX, centerSy + shakeY, zoomedSw, zoomedSh, x, y, w, h)
    ctx.restore()
  } else {
    // Stay zoomed in at the target scale after jitter is done
    ctx.drawImage(imgEl, centerSx, centerSy, zoomedSw, zoomedSh, x, y, w, h)
  }
}
