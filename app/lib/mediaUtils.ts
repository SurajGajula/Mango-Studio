import type { AspectRatio } from '@/app/stores/manifestStore'
import type { ImageClass } from '@/app/models/ImageClass'
import type { VideoClass } from '@/app/models/VideoClass'

export const ASPECT_RATIOS: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '1:1': [1, 1],
  '3:4': [3, 4],
  '9:16': [9, 16],
}

export function setVideoCrossOriginForUrl(video: HTMLVideoElement, url: string) {
  try {
    const u = new URL(url, window.location.href)
    if (u.origin !== window.location.origin) {
      video.crossOrigin = 'anonymous'
    } else {
      video.removeAttribute('crossOrigin')
    }
  } catch {
    video.removeAttribute('crossOrigin')
  }
}

export function clampCropZoomDimensions(
  cropSw: number,
  cropSh: number,
  factor: number,
  minSize: number
): { cropSw: number; cropSh: number } {
  const w = cropSw * factor
  const h = cropSh * factor
  const sLo = Math.max(minSize / w, minSize / h)
  const sHi = Math.min(1 / w, 1 / h)
  if (sLo <= sHi) {
    const s = Math.max(sLo, Math.min(sHi, 1))
    return { cropSw: w * s, cropSh: h * s }
  }
  return { cropSw, cropSh }
}

export function cropSwToShRatioForFrame(
  itemW: number,
  itemH: number,
  nw: number,
  nh: number
): number {
  return (itemW / itemH) * (nh / nw)
}

export function minUniformScaleToCoverLogicalCanvas(
  w: number,
  h: number,
  canvasAspectRatio: AspectRatio
): number {
  if (!(w > 0) || !(h > 0)) return 1
  const { logicalW, logicalH } = getLogicalCanvasDimensions(canvasAspectRatio)
  return Math.max(1, logicalW / w, logicalH / h)
}

export function getLogicalCanvasDimensions(_canvasAspect: AspectRatio): {
  logicalW: number
  logicalH: number
} {
  return { logicalW: 1080, logicalH: 1920 }
}

export function frameDimensionsForCropClamp(
  item: ImageClass | VideoClass,
  aspectRatio: AspectRatio
): { fw: number; fh: number } {
  const { logicalW, logicalH } = getLogicalCanvasDimensions(aspectRatio)
  if ('startTime' in item) {
    const img = item as ImageClass
    if (img.row === 0 && (img.cropAspect === aspectRatio || !img.cropAspect)) {
      return { fw: logicalW, fh: logicalH }
    }
    return { fw: img.width, fh: img.height }
  }
  const v = item as VideoClass
  if (v.row === 0 && (v.cropAspect === aspectRatio || !v.cropAspect)) {
    return { fw: logicalW, fh: logicalH }
  }
  return { fw: v.width, fh: v.height }
}

export function clampPlacementRectToLogicalCanvas(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  logicalW: number,
  logicalH: number
): { width: number; height: number; x: number; y: number } {
  if (!(width > 0) || !(height > 0)) {
    return { width, height, x: centerX - width / 2, y: centerY - height / 2 }
  }
  const scale = Math.min(1, logicalW / width, logicalH / height)
  const w = width * scale
  const h = height * scale
  let x = centerX - w / 2
  let y = centerY - h / 2
  x = Math.max(0, Math.min(x, logicalW - w))
  y = Math.max(0, Math.min(y, logicalH - h))
  return { width: w, height: h, x, y }
}

export function clampCropPairToSourceBounds(sw: number, sh: number, r: number): { cropSw: number; cropSh: number } {
  if (!(r > 0) || !Number.isFinite(r)) return { cropSw: sw, cropSh: sh }
  let s = sw
  let t = sh
  t = s / r
  if (t > 1) {
    t = 1
    s = r * t
  }
  if (s > 1) {
    s = 1
    t = s / r
  }
  if (t > 1) {
    t = 1
    s = r * t
  }
  if (s > 1) {
    s = 1
    t = s / r
  }
  return { cropSw: s, cropSh: t }
}

export function computeCanvasCropPlacement(
  url: string,
  type: 'image',
  aspectRatio: AspectRatio
): Promise<Partial<ImageClass>>
export function computeCanvasCropPlacement(
  url: string,
  type: 'video',
  aspectRatio: AspectRatio
): Promise<Partial<VideoClass>>
export function computeCanvasCropPlacement(
  url: string,
  type: 'image' | 'video',
  aspectRatio: AspectRatio
): Promise<Partial<ImageClass | VideoClass>> {
  const [rw, rh] = ASPECT_RATIOS[aspectRatio]
  return computeMediaCropForAspect(url, type, aspectRatio, rw, rh, aspectRatio)
}

export function clampCropZoomToFrameAspect(
  itemW: number,
  itemH: number,
  nw: number,
  nh: number,
  cropSw: number,
  cropSh: number,
  factor: number,
  minSize: number
): { cropSw: number; cropSh: number } {
  if (itemW <= 0 || itemH <= 0 || nw <= 0 || nh <= 0) {
    return clampCropZoomDimensions(cropSw, cropSh, factor, minSize)
  }
  const r = cropSwToShRatioForFrame(itemW, itemH, nw, nh)
  const lo = Math.max(minSize, minSize * r)
  const hi = Math.min(1, r)
  if (lo > hi) {
    return clampCropPairToSourceBounds(hi, hi / r, r)
  }
  let sw = cropSw * factor
  sw = Math.max(lo, Math.min(hi, sw))
  let sh = sw / r
  return clampCropPairToSourceBounds(sw, sh, r)
}

export function loadNaturalMediaSize(
  url: string,
  kind: 'image' | 'video'
): Promise<{ nw: number; nh: number }> {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('loadNaturalMediaSize: empty url'))
      return
    }
    if (kind === 'image') {
      const im = new Image()
      im.onload = () => {
        if (im.naturalWidth === 0 || im.naturalHeight === 0) {
          reject(new Error('loadNaturalMediaSize: zero image dimensions'))
          return
        }
        resolve({ nw: im.naturalWidth, nh: im.naturalHeight })
      }
      im.onerror = () => reject(new Error('loadNaturalMediaSize: image load failed'))
      im.src = url
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.playsInline = true
      v.onloadedmetadata = () => {
        const nw = v.videoWidth
        const nh = v.videoHeight
        v.src = ''
        v.load()
        if (nw === 0 || nh === 0) {
          reject(new Error('loadNaturalMediaSize: zero video dimensions'))
          return
        }
        resolve({ nw, nh })
      }
      v.onerror = () => reject(new Error('loadNaturalMediaSize: video load failed'))
      v.src = url
    }
  })
}

function normalizeCropRectangleForSourceRatio(
  r: number,
  cropSx: number,
  cropSy: number,
  cropSw: number,
  cropSh: number,
  minSize: number
): { cropSx: number; cropSy: number; cropSw: number; cropSh: number } | null {
  if (!(r > 0) || !Number.isFinite(r)) return null
  const lo = Math.max(minSize, minSize * r)
  const hi = Math.min(1, r)
  if (lo > hi) {
    const pair = clampCropPairToSourceBounds(hi, hi / r, r)
    const centerSx = cropSx + cropSw / 2
    const centerSy = cropSy + cropSh / 2
    return {
      cropSx: Math.max(0, Math.min(1 - pair.cropSw, centerSx - pair.cropSw / 2)),
      cropSy: Math.max(0, Math.min(1 - pair.cropSh, centerSy - pair.cropSh / 2)),
      cropSw: pair.cropSw,
      cropSh: pair.cropSh,
    }
  }
  const centerSx = cropSx + cropSw / 2
  const centerSy = cropSy + cropSh / 2
  let sw = Math.max(lo, Math.min(hi, cropSw))
  let sh = sw / r
  const pair = clampCropPairToSourceBounds(sw, sh, r)
  sw = pair.cropSw
  sh = pair.cropSh
  return {
    cropSx: Math.max(0, Math.min(1 - sw, centerSx - sw / 2)),
    cropSy: Math.max(0, Math.min(1 - sh, centerSy - sh / 2)),
    cropSw: sw,
    cropSh: sh,
  }
}

export function normalizeCropToFrameAspect(
  itemW: number,
  itemH: number,
  nw: number,
  nh: number,
  cropSx: number,
  cropSy: number,
  cropSw: number,
  cropSh: number,
  minSize: number
): { cropSx: number; cropSy: number; cropSw: number; cropSh: number } | null {
  if (itemW <= 0 || itemH <= 0 || nw <= 0 || nh <= 0) return null
  const r = cropSwToShRatioForFrame(itemW, itemH, nw, nh)
  return normalizeCropRectangleForSourceRatio(r, cropSx, cropSy, cropSw, cropSh, minSize)
}

export function computeMediaCropForAspect(
  url: string,
  type: 'image' | 'video',
  canvasAspectRatio: AspectRatio,
  targetW: number,
  targetH: number,
  cropAspectLabel: string
): Promise<Partial<ImageClass | VideoClass>> {
  const { logicalW: canvasW, logicalH: canvasH } = getLogicalCanvasDimensions(canvasAspectRatio)

  return new Promise((resolve) => {
    const el = type === 'image' ? new Image() : document.createElement('video')
    
    const onLoaded = () => {
      const nw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth
      const nh = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight
      if (nw === 0 || nh === 0) {
        resolve({})
        return
      }

      const naturalAspect = nw / nh
      const targetAspect = targetW / targetH

      let sx: number, sy: number, sw: number, sh: number
      if (Math.abs(targetAspect - naturalAspect) < 0.001) {
        sx = 0; sy = 0; sw = nw; sh = nh
      } else if (targetAspect > naturalAspect) {
        sw = nw
        sh = Math.round(nw / targetAspect)
        sx = 0
        sy = Math.round((nh - sh) / 2)
      } else {
        sh = nh
        sw = Math.round(nh * targetAspect)
        sx = Math.round((nw - sw) / 2)
        sy = 0
      }

      const canvasAspect = canvasW / canvasH
      let dw: number, dh: number
      if (targetAspect >= canvasAspect) {
        dw = canvasW
        dh = Math.round(canvasW / targetAspect)
      } else {
        dh = canvasH
        dw = Math.round(canvasH * targetAspect)
      }
      const ddx = Math.round((canvasW - dw) / 2)
      const ddy = Math.round((canvasH - dh) / 2)

      resolve({
        x: ddx,
        y: ddy,
        width: dw,
        height: dh,
        cropAspect: cropAspectLabel,
        cropSx: sx / nw,
        cropSy: sy / nh,
        cropSw: sw / nw,
        cropSh: sh / nh,
      })
      if (el instanceof HTMLVideoElement) {
        el.src = ''
        el.load()
      }
    }

    if (el instanceof HTMLImageElement) {
      el.onload = onLoaded
      el.onerror = () => resolve({})
    } else {
      el.onloadedmetadata = onLoaded
      el.onerror = () => resolve({})
      el.preload = 'metadata'
    }
    el.src = url
  })
}

export function withoutCanvasPlacement<M extends Partial<ImageClass | VideoClass>>(
  patch: M
): Omit<M, 'x' | 'y' | 'width' | 'height'> {
  const { x: _x, y: _y, width: _w, height: _h, ...rest } = patch
  return rest as Omit<M, 'x' | 'y' | 'width' | 'height'>
}

export function resolveVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const probe = document.createElement('video')
    const timeout = window.setTimeout(() => {
      probe.src = ''
      resolve({ duration: 8, width: 1080, height: 1920 })
    }, 8000)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      window.clearTimeout(timeout)
      const dur = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 8
      const width = probe.videoWidth || 1080
      const height = probe.videoHeight || 1920
      probe.src = ''
      resolve({ duration: dur, width, height })
    }
    probe.onerror = () => {
      window.clearTimeout(timeout)
      probe.src = ''
      resolve({ duration: 8, width: 1080, height: 1920 })
    }
    probe.src = url
  })
}

function computeMediaDimensions(
  mediaWidth: number,
  mediaHeight: number,
  aspectRatio: AspectRatio,
  isMainTrack = false
): { x: number; y: number; width: number; height: number } {
  const { logicalW: canvasW, logicalH: canvasH } = getLogicalCanvasDimensions(aspectRatio)
  const containerPxW = canvasW
  const containerPxH = canvasH
  const containerPxX = 0

  const mediaAspect = mediaWidth / mediaHeight
  let fitPxW: number, fitPxH: number

  if (isMainTrack) {
    fitPxW = containerPxW
    fitPxH = Math.round(containerPxW / mediaAspect)
  } else {
    // For overlays, fit inside container while preserving aspect ratio
    const containerAspect = containerPxW / containerPxH
    if (mediaAspect >= containerAspect) {
      fitPxW = containerPxW
      fitPxH = Math.round(containerPxW / mediaAspect)
    } else {
      fitPxH = containerPxH
      fitPxW = Math.round(containerPxH * mediaAspect)
    }
  }

  const pxX = containerPxX + Math.round((containerPxW - fitPxW) / 2)
  const pxY = Math.round((containerPxH - fitPxH) / 2)

  return {
    x: pxX,
    y: pxY,
    width: fitPxW,
    height: fitPxH,
  }
}

function computeImageDimensions(
  url: string,
  aspectRatio: AspectRatio,
  isMainTrack = false
): Promise<{ x: number; y: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve(computeMediaDimensions(img.naturalWidth, img.naturalHeight, aspectRatio, isMainTrack))
    }
    img.onerror = () => {
      resolve({ x: 0, y: 0, width: 1080, height: 1920 })
    }
    img.src = url
  })
}

export function computeCropForAspect(
  image: ImageClass,
  canvasAspectRatio: AspectRatio,
  targetW: number,
  targetH: number,
  cropAspectLabel: string
): Promise<Partial<ImageClass>> {
  return computeMediaCropForAspect(image.url, 'image', canvasAspectRatio, targetW, targetH, cropAspectLabel) as Promise<Partial<ImageClass>>
}

async function computeVideoDimensions(
  url: string,
  aspectRatio: AspectRatio,
  isMainTrack = false
): Promise<{ x: number; y: number; width: number; height: number }> {
  const { width, height } = await resolveVideoMetadata(url)
  return computeMediaDimensions(width, height, aspectRatio, isMainTrack)
}

export function computeVideoCropForAspect(
  video: VideoClass,
  canvasAspectRatio: AspectRatio,
  targetW: number,
  targetH: number,
  cropAspectLabel: string
): Promise<Partial<VideoClass>> {
  return computeMediaCropForAspect(video.url || '', 'video', canvasAspectRatio, targetW, targetH, cropAspectLabel) as Promise<Partial<VideoClass>>
}

export async function generateVideoThumbnails(
  url: string, 
  seconds: number[], 
  onProgress?: (time: number, data: string) => void
): Promise<Map<number, string> | null> {
  const video = document.createElement('video')
  video.src = url
  video.crossOrigin = 'anonymous'
  video.muted = true

  await new Promise<void>((resolve) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => resolve()
  })

  if (video.duration === 0 || !video.videoWidth) {
    video.src = ''
    return null
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const thumbHeight = 48
  const thumbWidth = Math.round(thumbHeight * (video.videoWidth / video.videoHeight)) || 85
  canvas.width = thumbWidth
  canvas.height = thumbHeight

  const thumbnails = new Map<number, string>()
  
  // Sort seconds to minimize seeking distance
  const sortedSeconds = [...seconds].sort((a, b) => a - b)

  for (const s of sortedSeconds) {
    if (s < 0 || s > video.duration) continue
    
    video.currentTime = s
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      // Fallback for slow seeking
      const t = setTimeout(resolve, 500)
      video.onseeked = () => {
        clearTimeout(t)
        resolve()
      }
    })
    
    ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight)
    const data = canvas.toDataURL('image/jpeg', 0.6)
    thumbnails.set(s, data)
    
    if (onProgress) {
      onProgress(s, data)
    }
    
    // Yield to event loop to keep UI responsive
    await new Promise(r => setTimeout(r, 0))
  }

  video.src = ''
  return thumbnails
}
