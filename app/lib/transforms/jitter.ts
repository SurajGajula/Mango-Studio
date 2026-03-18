import type { TransformParams } from './types'

export function applyJitter(params: TransformParams): void {
  const { ctx, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, elapsedTime } = params
  
  const jitterDuration = 0.4
  const scale = 1.1 // Reduced zoom for a more subtle effect
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
    // Frequencies adjusted for a more natural jitter
    const freqX1 = 20; const freqY1 = 16
    const freqX2 = 8; const freqY2 = 6
    
    // Reduced intensity for subtle movement
    const intensity = Math.min(1.0, zoomIntensity * 0.6)
    const shakeX = (Math.sin(t * Math.PI * freqX1) * 0.6 + Math.sin(t * Math.PI * freqX2) * 0.4) * pulse * maxShiftX * intensity
    const shakeY = (Math.cos(t * Math.PI * freqY1) * 0.6 + Math.cos(t * Math.PI * freqY2) * 0.4) * pulse * maxShiftY * intensity

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
