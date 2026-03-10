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
  elapsedTime = 0
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

  if (zoom === 'shake') {
    const scale = 1.15
    const zoomedSw = sw / scale
    const zoomedSh = sh / scale
    const maxShiftX = (sw - zoomedSw) / 2
    const maxShiftY = (sh - zoomedSh) / 2
    const angle = (elapsedTime / 5) * 2 * Math.PI
    const shakeX = Math.sin(angle) * maxShiftX * 0.7
    const shakeY = Math.cos(angle) * maxShiftY * 0.7
    const centerSx = sx + (sw - zoomedSw) / 2
    const centerSy = sy + (sh - zoomedSh) / 2
    const rotAngle = Math.sin(angle * 4) * 1.875 * (Math.PI / 180)
    const destCx = x + w / 2
    const destCy = y + h / 2
    const maxRot = 1.875 * (Math.PI / 180)
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
