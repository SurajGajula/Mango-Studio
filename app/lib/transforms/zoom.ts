import type { TransformParams } from './types'

export function applyStandardZoom(params: TransformParams): void {
  const { ctx, animation, progress, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, itemDuration, elapsedTime } = params
  
  let t = 0
  if (animation === 'pulse') {
    // Robust duration detection: progress = elapsedTime / totalDur
    // So totalDur = elapsedTime / progress.
    let totalDur = itemDuration || 1.0
    if (progress > 0.01 && progress < 0.99 && elapsedTime > 0) {
      const derivedDur = elapsedTime / progress
      if (derivedDur > 0.1) totalDur = derivedDur
    }
    
    // Zoom In/Out phases are 0.5s each. 
    const zoomInDur = Math.min(0.5, totalDur / 2)
    const zoomOutStart = totalDur - zoomInDur
    
    if (elapsedTime <= zoomInDur) {
      // Phase 1: Zoom In
      const relT = elapsedTime / zoomInDur
      t = Math.sin(relT * Math.PI / 2)
    } else if (elapsedTime >= zoomOutStart) {
      // Phase 3: Zoom Out
      const relT = Math.max(0, totalDur - elapsedTime) / zoomInDur
      t = Math.sin(relT * Math.PI / 2)
    } else {
      // Phase 2: Hold at Peak
      t = 1.0
    }
  }

  const scale = 1 + t * zoomIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2

  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
