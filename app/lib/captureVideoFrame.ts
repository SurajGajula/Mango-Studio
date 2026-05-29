import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import { getPreviewVideoElement } from '@/app/lib/previewVideoPool'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import {
  clipTimelineSpanForSourceMap,
  videoTimelineSourceMapping,
} from '@/app/lib/renderUtils'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import { useManifestStore } from '@/app/stores/manifestStore'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'

export function isVideoOnScreenAtTime(video: VideoClass, playbackTime: number): boolean {
  if (video.opacity <= 0) return false
  const span = manifestVideoTimelineSpanSeconds(video)
  if (span <= 0) return false
  return playbackTime >= video.timestamp && playbackTime < video.timestamp + span
}

function resolvedVideoSrc(video: VideoClass): string {
  const src = video.url || video.sourceUrl
  if (!src) throw new Error('Video has no media source')
  return src
}

async function seekVideoElement(el: HTMLVideoElement, time: number): Promise<void> {
  const clamped = Math.max(0, Math.min(time, Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.001) : time))
  if (Math.abs(el.currentTime - clamped) < 0.02 && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return
  }
  el.currentTime = clamped
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, 2000)
    const cleanup = () => {
      el.removeEventListener('seeked', onSeeked)
      el.removeEventListener('error', onError)
      window.clearTimeout(timeout)
    }
    el.addEventListener('seeked', onSeeked)
    el.addEventListener('error', onError)
  })
}

async function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  setVideoCrossOriginForUrl(video, src)
  video.src = src.startsWith('http') ? src : window.location.origin + src
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('Failed to load video for frame capture'))
  })
  return video
}

async function resolveVideoElementForCapture(
  video: VideoClass,
  sourceTime: number
): Promise<HTMLVideoElement> {
  const preview = getPreviewVideoElement(video.id)
  if (preview && preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && preview.videoWidth > 0) {
    await seekVideoElement(preview, sourceTime)
    return preview
  }
  const el = await loadVideoElement(resolvedVideoSrc(video))
  await seekVideoElement(el, sourceTime)
  return el
}

export async function captureVideoFrameDataUrl(
  video: VideoClass,
  playbackTime: number
): Promise<string> {
  const elapsed = playbackTime - video.timestamp
  const span = manifestVideoTimelineSpanSeconds(video)
  const vDur = clipTimelineSpanForSourceMap(
    video.duration != null && video.duration > 0 ? video.duration : span
  )
  const tm = videoTimelineSourceMapping(video, elapsed, vDur)
  const sourceTime = (video.trimStart ?? 0) + tm.sourceElapsed
  const el = await resolveVideoElementForCapture(video, sourceTime)

  const vw = el.videoWidth
  const vh = el.videoHeight
  if (vw <= 0 || vh <= 0) {
    throw new Error('Video frame is not ready')
  }

  const localElapsed = playbackTime - video.timestamp
  const kf = resolveMediaKeyframeTransform(video, localElapsed, span)
  const sx = (kf.cropSx ?? 0) * vw
  const sy = (kf.cropSy ?? 0) * vh
  const sw = (kf.cropSw ?? 1) * vw
  const sh = (kf.cropSh ?? 1) * vh

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create capture canvas')
  ctx.drawImage(el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function findFreeRow(
  items: Array<{ startTime: number; endTime: number; row: number }>,
  start: number,
  end: number
): number {
  let row = 0
  while (true) {
    const rowItems = items.filter((i) => i.row === row)
    const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
    if (!hasOverlap) return row
    row++
  }
}

export async function addVideoFrameCaptureAtPlayhead(videoId: string): Promise<void> {
  const state = useManifestStore.getState()
  const video = state.videos.find((v) => v.id === videoId)
  if (!video) throw new Error('Video not found')
  if (!isVideoOnScreenAtTime(video, state.playbackTime)) {
    throw new Error('Video is not on screen at the playhead')
  }

  const dataUrl = await captureVideoFrameDataUrl(video, state.playbackTime)
  const playbackTime = state.playbackTime
  const start = Math.max(0, playbackTime)
  const end = start + 5
  const span = manifestVideoTimelineSpanSeconds(video)
  const kf = resolveMediaKeyframeTransform(video, playbackTime - video.timestamp, span)

  const mediaItems = [
    ...state.images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
    ...state.videos.map((v) => ({
      startTime: v.timestamp,
      endTime: v.timestamp + (v.duration ?? 0),
      row: v.row,
    })),
  ]
  let row = findFreeRow(mediaItems, start, end)
  if (row > 0) {
    row = findFreeVisualOverlayRow(start, end)
  }

  const { addImage } = useManifestStore.getState()
  addImage(
    new ImageClass(
      `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      `${video.title} frame`,
      dataUrl,
      start,
      end,
      kf.x,
      kf.y,
      kf.width,
      kf.height,
      1,
      new Date(),
      'none',
      'none',
      video.cropAspect,
      0,
      0,
      1,
      1,
      video.zoomIntensity,
      undefined,
      undefined,
      video.animationZoomEasing,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      row,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      video.flipHorizontal,
      video.flipVertical
    )
  )
}
