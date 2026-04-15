import { AspectRatio } from '@/app/stores/manifest/types'
import { useManifestStore } from '@/app/stores/manifestStore'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import {
  ASPECT_RATIOS,
  computeCanvasCropPlacement,
  computeCropForAspect,
  computeVideoCropForAspect,
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
    store.pushHistory()
  }
}

export async function resolveImagePatch(
  url: string,
  aspectRatio: AspectRatio,
  cropAspect: ImageClass['cropAspect'] | VideoClass['cropAspect'],
  fallbackOnRatioMiss: boolean
): Promise<Partial<ImageClass>> {
  if (cropAspect) {
    const ratio = ASPECT_RATIOS[cropAspect]
    if (ratio) {
      return computeCropForAspect(new ImageClass('tmp', '', url, 0, 1), aspectRatio, ratio[0], ratio[1], cropAspect)
    }
    if (fallbackOnRatioMiss) {
      return computeCanvasCropPlacement(url, 'image', aspectRatio)
    }
    return {}
  }
  return computeCanvasCropPlacement(url, 'image', aspectRatio)
}

export async function resolveVideoPatch(
  sourceVideo: VideoClass,
  url: string,
  aspectRatio: AspectRatio,
  cropAspect: ImageClass['cropAspect'] | VideoClass['cropAspect'],
  fallbackOnRatioMiss: boolean
): Promise<Partial<VideoClass>> {
  if (cropAspect) {
    const ratio = ASPECT_RATIOS[cropAspect]
    if (ratio) {
      return computeVideoCropForAspect(sourceVideo, aspectRatio, ratio[0], ratio[1], cropAspect)
    }
    if (fallbackOnRatioMiss) {
      return computeCanvasCropPlacement(url, 'video', aspectRatio)
    }
    return {}
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
