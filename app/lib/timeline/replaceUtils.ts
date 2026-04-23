import { AspectRatio } from '@/app/stores/manifest/types'
import { useManifestStore } from '@/app/stores/manifestStore'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import {
  ASPECT_RATIOS,
  computeCanvasCropPlacement,
  computeCropForAspect,
  computeMediaCropForAspect,
  computeVideoCropForAspect,
  getLogicalCanvasDimensions,
} from '@/app/lib/mediaUtils'
import { timelineClipSourceSpanSeconds } from '@/app/lib/renderUtils'

export function runHistoryTransaction(
  mutate: (store: ReturnType<typeof useManifestStore.getState>) => void
): void {
  const store = useManifestStore.getState()
  store.pauseHistory()
  try {
    mutate(store)
  } finally {
    store.resumeHistory()
    store.pushHistory({ force: true })
  }
}

export function imageCropOverlayFromPatch(
  patch: Partial<ImageClass>,
  fallback: Pick<ImageClass, 'cropAspect' | 'cropSx' | 'cropSy' | 'cropSw' | 'cropSh'>
): Pick<Partial<ImageClass>, 'cropAspect' | 'cropSx' | 'cropSy' | 'cropSw' | 'cropSh'> {
  const min = 1e-4
  let cropSw = typeof patch.cropSw === 'number' && Number.isFinite(patch.cropSw) ? patch.cropSw : fallback.cropSw
  let cropSh = typeof patch.cropSh === 'number' && Number.isFinite(patch.cropSh) ? patch.cropSh : fallback.cropSh
  let cropSx = typeof patch.cropSx === 'number' && Number.isFinite(patch.cropSx) ? patch.cropSx : fallback.cropSx
  let cropSy = typeof patch.cropSy === 'number' && Number.isFinite(patch.cropSy) ? patch.cropSy : fallback.cropSy
  if (!(cropSw > min && cropSh > min)) {
    return {
      cropAspect: fallback.cropAspect,
      cropSx: fallback.cropSx,
      cropSy: fallback.cropSy,
      cropSw: fallback.cropSw,
      cropSh: fallback.cropSh,
    }
  }
  cropSw = Math.min(1, cropSw)
  cropSh = Math.min(1, cropSh)
  cropSx = Math.max(0, Math.min(1 - cropSw, cropSx))
  cropSy = Math.max(0, Math.min(1 - cropSh, cropSy))
  return {
    cropAspect: patch.cropAspect ?? fallback.cropAspect,
    cropSx,
    cropSy,
    cropSw,
    cropSh,
  }
}

export function videoCropOverlayFromPatch(
  patch: Partial<VideoClass>,
  fallback: Pick<VideoClass, 'cropAspect' | 'cropSx' | 'cropSy' | 'cropSw' | 'cropSh'>
): Pick<Partial<VideoClass>, 'cropAspect' | 'cropSx' | 'cropSy' | 'cropSw' | 'cropSh'> {
  const min = 1e-4
  let cropSw = typeof patch.cropSw === 'number' && Number.isFinite(patch.cropSw) ? patch.cropSw : fallback.cropSw
  let cropSh = typeof patch.cropSh === 'number' && Number.isFinite(patch.cropSh) ? patch.cropSh : fallback.cropSh
  let cropSx = typeof patch.cropSx === 'number' && Number.isFinite(patch.cropSx) ? patch.cropSx : fallback.cropSx
  let cropSy = typeof patch.cropSy === 'number' && Number.isFinite(patch.cropSy) ? patch.cropSy : fallback.cropSy
  if (!(cropSw > min && cropSh > min)) {
    return {
      cropAspect: fallback.cropAspect,
      cropSx: fallback.cropSx,
      cropSy: fallback.cropSy,
      cropSw: fallback.cropSw,
      cropSh: fallback.cropSh,
    }
  }
  cropSw = Math.min(1, cropSw)
  cropSh = Math.min(1, cropSh)
  cropSx = Math.max(0, Math.min(1 - cropSw, cropSx))
  cropSy = Math.max(0, Math.min(1 - cropSh, cropSy))
  return {
    cropAspect: patch.cropAspect ?? fallback.cropAspect,
    cropSx,
    cropSy,
    cropSw,
    cropSh,
  }
}

export function replacePlacementDimensions(
  item: Pick<ImageClass, 'x' | 'y' | 'width' | 'height'>,
  canvasAspect: AspectRatio
): { x: number; y: number; width: number; height: number } {
  const { logicalW, logicalH } = getLogicalCanvasDimensions(canvasAspect)
  const w0 = item.width
  const h0 = item.height
  if (Number.isFinite(w0) && Number.isFinite(h0) && w0 >= 2 && h0 >= 2) {
    return { x: item.x, y: item.y, width: w0, height: h0 }
  }
  const w = Math.round(logicalW * 0.88)
  const h = Math.round(logicalH * 0.88)
  return { x: (logicalW - w) / 2, y: (logicalH - h) / 2, width: w, height: h }
}

function placementTarget(
  placement: { width: number; height: number } | undefined,
  fallbackW: number,
  fallbackH: number,
  canvasAspect: AspectRatio
): { tw: number; th: number } {
  const { logicalW, logicalH } = getLogicalCanvasDimensions(canvasAspect)
  if (
    placement &&
    Number.isFinite(placement.width) &&
    Number.isFinite(placement.height) &&
    placement.width >= 2 &&
    placement.height >= 2
  ) {
    return { tw: placement.width, th: placement.height }
  }
  let w = fallbackW
  let h = fallbackH
  if (!(Number.isFinite(w) && Number.isFinite(h)) || w < 64 || h < 64) {
    return { tw: logicalW, th: logicalH }
  }
  return { tw: w, th: h }
}

export async function resolveImagePatch(
  url: string,
  aspectRatio: AspectRatio,
  cropAspect: ImageClass['cropAspect'] | VideoClass['cropAspect'],
  fallbackOnRatioMiss: boolean,
  placement?: { width: number; height: number }
): Promise<Partial<ImageClass>> {
  if (cropAspect) {
    const ratio = ASPECT_RATIOS[cropAspect]
    if (ratio) {
      const { tw, th } = placementTarget(placement, ratio[0], ratio[1], aspectRatio)
      return computeCropForAspect(new ImageClass('tmp', '', url, 0, 1), aspectRatio, tw, th, cropAspect)
    }
    if (fallbackOnRatioMiss) {
      const [fw, fh] = ASPECT_RATIOS[aspectRatio] ?? [1080, 1920]
      const { tw, th } = placementTarget(placement, fw, fh, aspectRatio)
      if (placement && placement.width > 0 && placement.height > 0) {
        return computeMediaCropForAspect(url, 'image', aspectRatio, tw, th, cropAspect) as Promise<Partial<ImageClass>>
      }
      return computeCanvasCropPlacement(url, 'image', aspectRatio)
    }
    return {}
  }
  const [cw, ch] = ASPECT_RATIOS[aspectRatio] ?? [1080, 1920]
  const { tw, th } = placementTarget(placement, cw, ch, aspectRatio)
  if (placement && placement.width > 0 && placement.height > 0) {
    return computeMediaCropForAspect(url, 'image', aspectRatio, tw, th, aspectRatio) as Promise<Partial<ImageClass>>
  }
  return computeCanvasCropPlacement(url, 'image', aspectRatio)
}

export async function resolveVideoPatch(
  sourceVideo: VideoClass,
  url: string,
  aspectRatio: AspectRatio,
  cropAspect: ImageClass['cropAspect'] | VideoClass['cropAspect'],
  fallbackOnRatioMiss: boolean,
  placement?: { width: number; height: number }
): Promise<Partial<VideoClass>> {
  if (cropAspect) {
    const ratio = ASPECT_RATIOS[cropAspect]
    if (ratio) {
      const { tw, th } = placementTarget(placement, ratio[0], ratio[1], aspectRatio)
      return computeVideoCropForAspect(sourceVideo, aspectRatio, tw, th, cropAspect)
    }
    if (fallbackOnRatioMiss) {
      const [fw, fh] = ASPECT_RATIOS[aspectRatio] ?? [1080, 1920]
      const { tw, th } = placementTarget(placement, fw, fh, aspectRatio)
      if (placement && placement.width > 0 && placement.height > 0) {
        return computeMediaCropForAspect(url, 'video', aspectRatio, tw, th, cropAspect) as Promise<Partial<VideoClass>>
      }
      return computeCanvasCropPlacement(url, 'video', aspectRatio)
    }
    return {}
  }
  const [cw, ch] = ASPECT_RATIOS[aspectRatio] ?? [1080, 1920]
  const { tw, th } = placementTarget(placement, cw, ch, aspectRatio)
  if (placement && placement.width > 0 && placement.height > 0) {
    return computeMediaCropForAspect(url, 'video', aspectRatio, tw, th, aspectRatio) as Promise<Partial<VideoClass>>
  }
  return computeCanvasCropPlacement(url, 'video', aspectRatio)
}

export function normalizeClipSpeedWindow(
  windowDuration: number,
  sourceDuration: number,
  playbackSpeed: number,
  speedStart: number,
  speedEnd: number,
  speedEasing: 'linear' | 'ease'
): { playbackSpeed: number; speedStart: number; speedEnd: number; sourceWindowDuration: number } {
  let nextPlaybackSpeed = playbackSpeed
  let nextSpeedStart = speedStart
  let nextSpeedEnd = speedEnd
  let sourceWindowDuration = timelineClipSourceSpanSeconds(
    windowDuration,
    nextPlaybackSpeed,
    nextSpeedStart,
    nextSpeedEnd,
    speedEasing
  )
  if (sourceDuration < sourceWindowDuration) {
    const scale = sourceDuration / sourceWindowDuration
    nextPlaybackSpeed = nextPlaybackSpeed * scale
    nextSpeedStart = nextSpeedStart * scale
    nextSpeedEnd = nextSpeedEnd * scale
    sourceWindowDuration = sourceDuration
  }
  return {
    playbackSpeed: nextPlaybackSpeed,
    speedStart: nextSpeedStart,
    speedEnd: nextSpeedEnd,
    sourceWindowDuration,
  }
}
