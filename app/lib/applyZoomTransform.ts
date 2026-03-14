import type { ZoomMode } from '@/app/models/ImageClass'

export function applyZoomTransform(
  ctx: CanvasRenderingContext2D,
  zoom: ZoomMode | undefined,
  progress: number,
  imgEl: HTMLImageElement | HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  cropSx = 0,
  cropSy = 0,
  cropSw = 1,
  cropSh = 1,
  zoomIntensity = 0.5,
  elapsedTime = 0,
  prevEl?: HTMLImageElement | HTMLVideoElement,
  prevParams?: {
    x: number;
    y: number;
    w: number;
    h: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  }
): void {
  const nw = imgEl instanceof HTMLImageElement ? imgEl.naturalWidth : imgEl.videoWidth
  const nh = imgEl instanceof HTMLImageElement ? imgEl.naturalHeight : imgEl.videoHeight
  const sx = nw * cropSx
  const sy = nh * cropSy
  const sw = nw * cropSw
  const sh = nh * cropSh

  if (!zoom || zoom === 'none') {
    ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
    return
  }

  if (zoom === 'jitter') {
    const jitterDuration = 0.25
    if (elapsedTime < jitterDuration + 0.001) {
      const t = elapsedTime / jitterDuration
      const pulse = Math.sin(t * Math.PI)
      
      // Smoothly zoom in and out
      const currentScale = 1 + (0.12 * pulse)
      const zoomedSw = sw / currentScale
      const zoomedSh = sh / currentScale
      
      const maxShiftX = (sw - zoomedSw) / 2
      const maxShiftY = (sh - zoomedSh) / 2
      
      // Lower frequencies to avoid aliasing and ensure smooth motion at 30fps
      // Using 3 and 2 cycles results in a more organic, weighted shake
      const jitterIntensity = 0.5 * zoomIntensity
      const shakeX = Math.sin(t * Math.PI * 3) * pulse * jitterIntensity * maxShiftX
      const shakeY = Math.cos(t * Math.PI * 2) * pulse * jitterIntensity * maxShiftY
      
      const centerSx = sx + (sw - zoomedSw) / 2
      const centerSy = sy + (sh - zoomedSh) / 2
      
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.drawImage(imgEl, centerSx + shakeX, centerSy + shakeY, zoomedSw, zoomedSh, x, y, w, h)
      ctx.restore()
    } else {
      ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
    }
    return
  }

  if (zoom === 'split-horizontal' || zoom === 'split-vertical') {
    // Draw the new item (reveal target) first
    ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)

    if (prevEl && prevParams && progress < 1) {
      const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
      const t = Math.max(0, Math.min(1, progress)) // Clamp progress
      
      ctx.save()
      // Clip to the reveal target's bounds to ensure nothing shows outside
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()

      // Use cubic easing for a smoother, more natural slide
      const ease = t * t * (3 - 2 * t)

      if (zoom === 'split-horizontal') {
        const halfW = pw / 2
        const halfSw = psw / 2
        
        // Ensure pieces move far enough to clear the reveal target's entire width
        // and its own width, whichever is larger.
        const totalShift = Math.max(halfW, (px - x) + halfW, (x + w) - (px + halfW))
        const shift = totalShift * ease
        
        // Left half
        ctx.drawImage(prevEl, psx, psy, halfSw, psh, px - shift, py, halfW, ph)
        // Right half
        ctx.drawImage(prevEl, psx + halfSw, psy, halfSw, psh, px + halfW + shift, py, halfW, ph)
      } else {
        const halfH = ph / 2
        const halfSh = psh / 2
        
        // Ensure pieces move far enough to clear the reveal target's entire height
        // This is critical for vertical splits in 9:16 mode where ph is often < h
        // and ensures the pieces exit the frame completely.
        const totalShift = Math.max(halfH, (py - y) + halfH, (y + h) - (py + halfH))
        const shift = totalShift * ease
        
        // Top half
        ctx.drawImage(prevEl, psx, psy, psw, halfSh, px, py - shift, pw, halfH)
        // Bottom half
        ctx.drawImage(prevEl, psx, psy + halfSh, psw, halfSh, px, py + halfH + shift, pw, halfH)
      }
      ctx.restore()
    }
    return
  }

  if (zoom === 'shake') {
    const scale = 1.15
    const zoomedSw = sw / scale
    const zoomedSh = sh / scale
    
    // Faster, more organic oscillation frequencies
    const time = elapsedTime * 2.5
    const angle = time * 2 * Math.PI
    
    // Keep translation extremely subtle to stabilize the center
    const maxShiftX = (sw - zoomedSw) / 2
    const maxShiftY = (sh - zoomedSh) / 2
    const shakeIntensity = 0.15 * zoomIntensity
    const shakeX = Math.sin(angle * 0.8) * maxShiftX * shakeIntensity
    const shakeY = Math.cos(angle * 0.9) * maxShiftY * shakeIntensity
    
    // Use rotation as the primary "edge shake" mechanism
    // Rotation moves the edges significantly while leaving the center (the pivot) stable
    const rotAmplitude = (2.2 * (Math.PI / 180)) * zoomIntensity
    const rotAngle = Math.sin(angle * 1.2) * rotAmplitude
    
    const centerSx = sx + (sw - zoomedSw) / 2
    const centerSy = sy + (sh - zoomedSh) / 2
    
    const destCx = x + w / 2
    const destCy = y + h / 2
    
    const maxRot = rotAmplitude
    const coverScale = Math.cos(maxRot) + Math.max(w / h, h / w) * Math.sin(maxRot)
    const dw = w * coverScale
    const dh = h * coverScale
    
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    
    ctx.translate(destCx, destCy)
    ctx.rotate(rotAngle)
    ctx.drawImage(imgEl, centerSx + shakeX, centerSy + shakeY, zoomedSw, zoomedSh, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
    return
  }

  const t = zoom === 'in' ? progress : 1 - progress
  const scale = 1 + t * zoomIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2
  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
