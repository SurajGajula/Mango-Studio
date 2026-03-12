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

export function computeMediaCropForAspect(
  url: string,
  type: 'image' | 'video',
  canvasAspectRatio: AspectRatio,
  targetW: number,
  targetH: number,
  cropAspectLabel: string
): Promise<Partial<ImageClass | VideoClass>> {
  const canvasW = canvasAspectRatio === '16:9' ? 1920 : 1080
  const canvasH = canvasAspectRatio === '16:9' ? 1080 : 1920

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

export function resolveVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const probe = document.createElement('video')
    const timeout = window.setTimeout(() => {
      probe.src = ''
      resolve({ duration: 8, width: 1920, height: 1080 })
    }, 8000)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      window.clearTimeout(timeout)
      const dur = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 8
      const width = probe.videoWidth || 1920
      const height = probe.videoHeight || 1080
      probe.src = ''
      resolve({ duration: dur, width, height })
    }
    probe.onerror = () => {
      window.clearTimeout(timeout)
      probe.src = ''
      resolve({ duration: 8, width: 1920, height: 1080 })
    }
    probe.src = url
  })
}

export function toMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < numChannels; c++) {
    const channel = audioBuffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += channel[i]
  }
  for (let i = 0; i < length; i++) mono[i] /= numChannels
  return mono
}

export function computeMediaDimensions(
  mediaWidth: number,
  mediaHeight: number,
  aspectRatio: AspectRatio,
  isMainTrack = false
): { x: number; y: number; width: number; height: number } {
  const canvasW = aspectRatio === '16:9' ? 1920 : 1080
  const canvasH = aspectRatio === '16:9' ? 1080 : 1920

  // The container is always the full canvas now, for both main track and overlays.
  // Previously overlays in 16:9 were restricted to a 9:16 column.
  const containerPxW = canvasW
  const containerPxH = canvasH
  const containerPxX = 0

  const mediaAspect = mediaWidth / mediaHeight
  let fitPxW: number, fitPxH: number

  if (isMainTrack) {
    if (aspectRatio === '16:9') {
      fitPxH = containerPxH
      fitPxW = Math.round(containerPxH * mediaAspect)
    } else {
      fitPxW = containerPxW
      fitPxH = Math.round(containerPxW / mediaAspect)
    }
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

export function computeImageDimensions(
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
      resolve({ x: 0, y: 0, width: 1920, height: 1080 })
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
  const canvasW = canvasAspectRatio === '16:9' ? 1920 : 1080
  const canvasH = canvasAspectRatio === '16:9' ? 1080 : 1920

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
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
    }
    img.onerror = () => resolve({})
    img.src = image.url
  })
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
