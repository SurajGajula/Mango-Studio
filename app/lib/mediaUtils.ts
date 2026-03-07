import type { AspectRatio } from '@/app/stores/manifestStore'

export function resolveVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement('video')
    const timeout = window.setTimeout(() => {
      probe.src = ''
      resolve(8)
    }, 8000)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      window.clearTimeout(timeout)
      const dur = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 8
      probe.src = ''
      resolve(dur)
    }
    probe.onerror = () => {
      window.clearTimeout(timeout)
      probe.src = ''
      resolve(8)
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

export function computeImageDimensions(
  url: string,
  aspectRatio: AspectRatio,
  isMainTrack = false
): Promise<{ x: number; y: number; width: number; height: number }> {
  const canvasW = aspectRatio === '16:9' ? 1920 : 1080
  const canvasH = aspectRatio === '16:9' ? 1080 : 1920

  let containerPxW: number, containerPxH: number, containerPxX: number
  if (isMainTrack) {
    containerPxW = canvasW
    containerPxH = canvasH
    containerPxX = 0
  } else {
    containerPxW = aspectRatio === '16:9' ? Math.round(canvasH * 9 / 16) : canvasW
    containerPxH = canvasH
    containerPxX = Math.round((canvasW - containerPxW) / 2)
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const imgAspect = img.naturalWidth / img.naturalHeight
      const containerAspect = containerPxW / containerPxH
      let fitPxW: number, fitPxH: number
      if (imgAspect >= containerAspect) {
        fitPxW = containerPxW
        fitPxH = Math.round(containerPxW / imgAspect)
      } else {
        fitPxH = containerPxH
        fitPxW = Math.round(containerPxH * imgAspect)
      }
      const pxX = containerPxX + Math.round((containerPxW - fitPxW) / 2)
      const pxY = Math.round((containerPxH - fitPxH) / 2)
      resolve({
        x: Math.round(pxX * 1920 / canvasW),
        y: Math.round(pxY * 1080 / canvasH),
        width: Math.round(fitPxW * 1920 / canvasW),
        height: Math.round(fitPxH * 1080 / canvasH),
      })
    }
    img.onerror = () => resolve({
      x: Math.round(containerPxX * 1920 / canvasW),
      y: 0,
      width: Math.round(containerPxW * 1920 / canvasW),
      height: Math.round(containerPxH * 1080 / canvasH),
    })
    img.src = url
  })
}

export async function generateVideoThumbnails(url: string): Promise<string[] | null> {
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

  const thumbnails: string[] = []
  const numThumbs = Math.max(1, Math.ceil(video.duration))

  for (let i = 0; i < numThumbs; i++) {
    video.currentTime = i
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      setTimeout(resolve, 200)
    })
    ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight)
    thumbnails.push(canvas.toDataURL('image/jpeg', 0.6))
  }

  video.src = ''
  return thumbnails
}
