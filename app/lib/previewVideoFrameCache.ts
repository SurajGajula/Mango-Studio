import { wakePreviewLoop } from '@/app/lib/playbackClock'

type PreviewVideoFrameEntry = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  valid: boolean
}

const previewVideoFrameCache = new WeakMap<HTMLVideoElement, PreviewVideoFrameEntry>()
const previewVideoListenerAttached = new WeakSet<HTMLVideoElement>()
const rvfcScheduled = new WeakSet<HTMLVideoElement>()

type VideoFrameRequestCallbackMetadata = {
  presentationTime: number
  expectedDisplayTime: number
  width: number
  height: number
  mediaTime: number
  presentedFrames: number
  processingDuration?: number
}

type HTMLVideoElementWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameRequestCallbackMetadata) => void
  ) => number
}

export function videoHasDecodedPreviewFrame(el: HTMLVideoElement): boolean {
  return el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0 && el.videoHeight > 0
}

function peekPreviewVideoFrame(el: HTMLVideoElement): HTMLCanvasElement | null {
  const entry = previewVideoFrameCache.get(el)
  return entry?.valid ? entry.canvas : null
}

function refreshPreviewVideoFrame(el: HTMLVideoElement): void {
  capturePreviewVideoFrame(el)
  wakePreviewLoop()
}

export function attachPreviewVideoFrameListeners(el: HTMLVideoElement): void {
  if (previewVideoListenerAttached.has(el)) return
  previewVideoListenerAttached.add(el)
  el.addEventListener('loadeddata', () => refreshPreviewVideoFrame(el))
  el.addEventListener('canplay', () => refreshPreviewVideoFrame(el))
  el.addEventListener('seeked', () => refreshPreviewVideoFrame(el))
  el.addEventListener('timeupdate', () => {
    if (!el.paused && !el.seeking) refreshPreviewVideoFrame(el)
  })
}

export function capturePreviewVideoFrame(el: HTMLVideoElement): HTMLCanvasElement | null {
  attachPreviewVideoFrameListeners(el)

  let entry = previewVideoFrameCache.get(el)
  if (!entry) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    entry = { canvas, ctx, valid: false }
    previewVideoFrameCache.set(el, entry)
  }

  if (el.seeking) {
    return entry.valid ? entry.canvas : null
  }

  if (!videoHasDecodedPreviewFrame(el)) {
    return entry.valid ? entry.canvas : null
  }

  const w = el.videoWidth
  const h = el.videoHeight
  if (entry.canvas.width !== w || entry.canvas.height !== h) {
    entry.valid = false
    entry.canvas.width = w
    entry.canvas.height = h
  }

  try {
    entry.ctx.drawImage(el, 0, 0, w, h)
    entry.valid = true
    return entry.canvas
  } catch {
    return entry.valid ? entry.canvas : null
  }
}

export function invalidatePreviewVideoFrameCache(el: HTMLVideoElement): void {
  const entry = previewVideoFrameCache.get(el)
  if (entry) entry.valid = false
}

export function resolvePreviewVideoDrawSource(el: HTMLVideoElement): HTMLCanvasElement | null {
  return capturePreviewVideoFrame(el) ?? peekPreviewVideoFrame(el)
}

export function previewVideoFrameReady(el: HTMLVideoElement): boolean {
  return resolvePreviewVideoDrawSource(el) !== null
}

export function primePreviewVideoFrame(el: HTMLVideoElement): void {
  capturePreviewVideoFrame(el)
}

export function schedulePreviewVideoFrameCapture(el: HTMLVideoElement): void {
  if (el.paused || el.seeking || rvfcScheduled.has(el)) return
  const rvfc = (el as HTMLVideoElementWithRvfc).requestVideoFrameCallback
  if (typeof rvfc !== 'function') return
  rvfcScheduled.add(el)
  rvfc.call(el, () => {
    rvfcScheduled.delete(el)
    capturePreviewVideoFrame(el)
    wakePreviewLoop()
    if (!el.paused && !el.seeking) schedulePreviewVideoFrameCapture(el)
  })
}
