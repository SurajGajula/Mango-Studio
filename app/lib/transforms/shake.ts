import type { TransformParams } from './types'

export function applyShake(params: TransformParams): void {
  const { ctx, imgEl, x, y, w, h, sx, sy, sw, sh, zoomIntensity, elapsedTime } = params
  
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
}
