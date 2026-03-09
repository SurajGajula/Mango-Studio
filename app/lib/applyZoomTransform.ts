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
  zoomIntensity = 0.15
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
  const t = zoom === 'in' ? progress : 1 - progress
  const scale = 1 + t * zoomIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2
  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
