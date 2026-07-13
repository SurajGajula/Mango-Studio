import type { MutableRefObject } from 'react'
import { isTimelineScrubbingRef, wakePreviewLoop } from '@/app/lib/playbackClock'
import {
  attachPreviewVideoFrameListeners,
  invalidatePreviewVideoFrameCache,
  previewVideoFrameReady,
} from '@/app/lib/previewVideoFrameCache'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import {
  isVideoActiveAtTimelineTime,
  videoTimelineActiveEnd,
} from '@/app/lib/adjacentSplitVideo'
import {
  uniqueVideoMediaUrlCount,
  videoPlaybackMediaUrl,
  videoSourceTrimBase,
} from '@/app/lib/videoPlaybackSource'
import type { VideoClass } from '@/app/models/VideoClass'
import type { ImageClass } from '@/app/models/ImageClass'
import { useManifestStore } from '@/app/stores/manifestStore'

export const MAX_ACTIVE_PREVIEW_VIDEOS = 3
export const MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS = 2
export const PREVIEW_VIDEO_RELEASE_GRACE_MS = 500
export const PREVIEW_VIDEO_PREFETCH_SEC = 6
export const PREVIEW_VIDEO_PREFETCH_SEC_MANY_CLIPS = 3
export const PREVIEW_VIDEO_SCRUB_PREFETCH_SEC = 5
export const PREVIEW_VIDEO_SCRUB_PREFETCH_SEC_MANY_CLIPS = 3
const MANY_UNIQUE_SOURCES = 3

function prefetchLeadForPool(uniqueSources: number, scrubbing: boolean): number {
  if (uniqueSources <= 2) {
    return scrubbing ? PREVIEW_VIDEO_SCRUB_PREFETCH_SEC : PREVIEW_VIDEO_PREFETCH_SEC
  }
  if (scrubbing) {
    return uniqueSources > MANY_UNIQUE_SOURCES
      ? PREVIEW_VIDEO_SCRUB_PREFETCH_SEC_MANY_CLIPS
      : PREVIEW_VIDEO_SCRUB_PREFETCH_SEC
  }
  return uniqueSources > MANY_UNIQUE_SOURCES
    ? PREVIEW_VIDEO_PREFETCH_SEC_MANY_CLIPS
    : PREVIEW_VIDEO_PREFETCH_SEC
}

function maxActivePreviewVideos(uniqueSources: number): number {
  if (uniqueSources <= 0) return MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS
  if (uniqueSources <= 2) return Math.max(uniqueSources, MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS)
  return uniqueSources > MANY_UNIQUE_SOURCES
    ? MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS
    : MAX_ACTIVE_PREVIEW_VIDEOS
}

type PersistenceCanvasMap = Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>

const lastMediaUrlByClipId = new Map<string, string>()

function resolvedVideoElementSrc(src: string): string {
  if (src.startsWith('blob:') || src.startsWith('http')) return src
  return window.location.origin + src
}

function resolvedMediaHref(src: string): string {
  try {
    return new URL(src, window.location.href).href
  } catch {
    return src
  }
}

function videoElementSrcMatches(el: HTMLVideoElement, src: string): boolean {
  const current = el.currentSrc || el.src || ''
  return resolvedMediaHref(current) === resolvedMediaHref(src)
}

function previewPoolKey(clip: VideoClass): string {
  return videoPlaybackMediaUrl(clip) || clip.id
}

function uniquePreviewElements(map: Map<string, HTMLVideoElement>): HTMLVideoElement[] {
  return [...new Set(map.values())]
}

function clipIdsForElement(
  map: Map<string, HTMLVideoElement>,
  el: HTMLVideoElement
): string[] {
  const ids: string[] = []
  map.forEach((value, id) => {
    if (value === el) ids.push(id)
  })
  return ids
}

function destroyPreviewVideoElement(video: HTMLVideoElement) {
  video.pause()
  video.src = ''
  video.load()
}

export function releasePreviewVideoElement(
  id: string,
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>
) {
  releaseDeadlinesRef.current.delete(id)
  const video = videoElementsRef.current.get(id)
  videoElementsRef.current.delete(id)
  persistenceCanvasesRef.current.delete(id)
  lastMediaUrlByClipId.delete(id)
  if (!video) return
  for (const el of videoElementsRef.current.values()) {
    if (el === video) return
  }
  destroyPreviewVideoElement(video)
}

function clipDistanceFromPlayhead(
  clip: VideoClass,
  playbackTime: number,
  videosList: VideoClass[]
): number {
  const span = manifestVideoTimelineSpanSeconds(clip)
  if (span <= 0) return Number.POSITIVE_INFINITY
  const start = clip.timestamp
  const end = videoTimelineActiveEnd(clip, videosList)
  if (playbackTime >= start && playbackTime < end) return 0
  if (playbackTime < start) return start - playbackTime
  return playbackTime - end
}

function elementDistanceFromPlayhead(
  el: HTMLVideoElement,
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>
): number {
  let best = Number.POSITIVE_INFINITY
  for (const id of clipIdsForElement(videoElementsRef.current, el)) {
    const clip = videosList.find((v) => v.id === id)
    if (!clip) continue
    best = Math.min(best, clipDistanceFromPlayhead(clip, playbackTime, videosList))
  }
  return best
}

function enforceMaxActivePreviewVideos(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>,
  maxActive: number
) {
  while (uniquePreviewElements(videoElementsRef.current).length > maxActive) {
    let farthestEl: HTMLVideoElement | null = null
    let farthestDist = -1
    for (const el of uniquePreviewElements(videoElementsRef.current)) {
      const dist = elementDistanceFromPlayhead(el, playbackTime, videosList, videoElementsRef)
      if (dist > farthestDist) {
        farthestDist = dist
        farthestEl = el
      }
    }
    if (!farthestEl) break
    for (const id of clipIdsForElement(videoElementsRef.current, farthestEl)) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
    }
  }
}

function isClipNearPlayhead(
  clip: VideoClass,
  videosList: VideoClass[],
  playbackTime: number,
  imagesList: ImageClass[],
  prefetchLead: number
): boolean {
  if (isVideoActiveAtTimelineTime(clip, videosList, playbackTime, imagesList)) return true
  return playbackTime < clip.timestamp && clip.timestamp - playbackTime <= prefetchLead
}

export function purgeOffscreenPreviewVideos(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>,
  imagesList: ImageClass[] = []
) {
  const uniqueSources = uniqueVideoMediaUrlCount(videosList)
  const prefetchLead = prefetchLeadForPool(uniqueSources, false)
  const ids = [...videoElementsRef.current.keys()]
  for (const id of ids) {
    const clip = videosList.find((v) => v.id === id)
    if (!clip) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
      continue
    }
    if (!isClipNearPlayhead(clip, videosList, playbackTime, imagesList, prefetchLead)) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
    }
  }
  releaseDeadlinesRef.current.clear()
  enforceMaxActivePreviewVideos(
    playbackTime,
    videosList,
    videoElementsRef,
    persistenceCanvasesRef,
    releaseDeadlinesRef,
    maxActivePreviewVideos(uniqueSources)
  )
}

export function activePreviewVideosNeedFrames(
  playbackTime: number,
  videosList: VideoClass[],
  imagesList: ImageClass[],
  videoElements: Map<string, HTMLVideoElement>
): boolean {
  for (let i = 0; i < videosList.length; i++) {
    const clip = videosList[i]
    if (clip.row < 0) continue
    const span = manifestVideoTimelineSpanSeconds(clip)
    if (span <= 0) continue
    if (!isVideoActiveAtTimelineTime(clip, videosList, playbackTime, imagesList)) continue
    const el = videoElements.get(clip.id)
    if (!el || el.seeking || !previewVideoFrameReady(el)) return true
  }
  return false
}

function createPreviewVideoElement(clip: VideoClass, clipSrc: string, preload: 'auto' | 'metadata') {
  const video = document.createElement('video')
  video.preload = preload
  video.playsInline = true
  setVideoCrossOriginForUrl(video, clipSrc)
  video.src = resolvedVideoElementSrc(clipSrc)
  video.onloadedmetadata = () => {
    const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
    if (!currentClip) return
    const elDur = video.duration
    const trimBase = videoSourceTrimBase(currentClip)
    const hasTrim = trimBase > 0 || currentClip.trimEnd > 0
    const cd = currentClip.duration
    const needsTimelineDuration = cd == null || !(cd > 0)
    const storedOrig = currentClip.originalDuration ?? 0
    const patch: Record<string, number> = {}
    if (elDur > 0 && needsTimelineDuration && !hasTrim) {
      patch.duration = elDur
    }
    if (elDur > storedOrig + 0.05 && !hasTrim) {
      patch.originalDuration = elDur
    }
    if (Object.keys(patch).length > 0) {
      useManifestStore.getState().updateVideo(clip.id, patch)
    }
    if (Math.abs(video.currentTime - trimBase) > 0.05) {
      video.currentTime = trimBase
    }
    wakePreviewLoop()
  }
  attachPreviewVideoFrameListeners(video)
  return video
}

function findExistingElementForUrl(
  mediaUrl: string,
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  freeByUrl: Map<string, HTMLVideoElement>
): HTMLVideoElement | undefined {
  const href = resolvedMediaHref(resolvedVideoElementSrc(mediaUrl))
  const free = freeByUrl.get(href) || freeByUrl.get(resolvedMediaHref(mediaUrl))
  if (free) {
    freeByUrl.delete(href)
    freeByUrl.delete(resolvedMediaHref(mediaUrl))
    return free
  }
  for (const el of uniquePreviewElements(videoElementsRef.current)) {
    if (videoElementSrcMatches(el, mediaUrl)) return el
  }
  return undefined
}

function parkElementIfUnused(
  el: HTMLVideoElement,
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  freeByUrl: Map<string, HTMLVideoElement>
) {
  for (const other of videoElementsRef.current.values()) {
    if (other === el) return
  }
  if ([...freeByUrl.values()].includes(el)) return
  const src = el.currentSrc || el.src || ''
  if (!src) {
    destroyPreviewVideoElement(el)
    return
  }
  freeByUrl.set(resolvedMediaHref(src), el)
}

export function syncManifestVideoPool(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>,
  imagesList: ImageClass[] = []
) {
  const now = performance.now()
  const uniqueSources = uniqueVideoMediaUrlCount(videosList)
  const prefetchLead = prefetchLeadForPool(uniqueSources, isTimelineScrubbingRef.current)
  const maxActive = maxActivePreviewVideos(uniqueSources)
  const currentIds = new Set(videosList.map((v) => v.id))

  lastMediaUrlByClipId.forEach((_, id) => {
    if (!currentIds.has(id)) lastMediaUrlByClipId.delete(id)
  })

  const freeByUrl = new Map<string, HTMLVideoElement>()
  videoElementsRef.current.forEach((el, id) => {
    if (currentIds.has(id)) return
    releaseDeadlinesRef.current.delete(id)
    videoElementsRef.current.delete(id)
    persistenceCanvasesRef.current.delete(id)
    lastMediaUrlByClipId.delete(id)
    parkElementIfUnused(el, videoElementsRef, freeByUrl)
  })

  const nearClips = videosList
    .filter((clip) => isClipNearPlayhead(clip, videosList, playbackTime, imagesList, prefetchLead))
    .sort((a, b) => a.timestamp - b.timestamp)

  const nearIds = new Set(nearClips.map((c) => c.id))

  for (const id of [...videoElementsRef.current.keys()]) {
    if (nearIds.has(id)) {
      releaseDeadlinesRef.current.delete(id)
      continue
    }
    const deadline = releaseDeadlinesRef.current.get(id)
    if (isTimelineScrubbingRef.current) {
      if (!deadline) {
        releaseDeadlinesRef.current.set(id, now + PREVIEW_VIDEO_RELEASE_GRACE_MS)
      }
      continue
    }
    if (deadline && now < deadline) continue
    const el = videoElementsRef.current.get(id)
    videoElementsRef.current.delete(id)
    persistenceCanvasesRef.current.delete(id)
    releaseDeadlinesRef.current.delete(id)
    lastMediaUrlByClipId.delete(id)
    if (el) parkElementIfUnused(el, videoElementsRef, freeByUrl)
  }

  releaseDeadlinesRef.current.forEach((deadline, id) => {
    if (now < deadline) return
    if (nearIds.has(id)) {
      releaseDeadlinesRef.current.delete(id)
      return
    }
    const el = videoElementsRef.current.get(id)
    videoElementsRef.current.delete(id)
    persistenceCanvasesRef.current.delete(id)
    releaseDeadlinesRef.current.delete(id)
    lastMediaUrlByClipId.delete(id)
    if (el) parkElementIfUnused(el, videoElementsRef, freeByUrl)
  })

  const neededByUrl = new Map<string, VideoClass[]>()
  for (const clip of nearClips) {
    const mediaUrl = previewPoolKey(clip)
    if (!mediaUrl) continue
    const list = neededByUrl.get(mediaUrl) || []
    list.push(clip)
    neededByUrl.set(mediaUrl, list)
  }

  neededByUrl.forEach((clips, mediaUrl) => {
    const primary =
      clips.find((c) => isVideoActiveAtTimelineTime(c, videosList, playbackTime, imagesList)) ||
      clips.reduce((best, clip) =>
        clipDistanceFromPlayhead(clip, playbackTime, videosList) <
        clipDistanceFromPlayhead(best, playbackTime, videosList)
          ? clip
          : best
      )

    let video =
      clips
        .map((clip) => videoElementsRef.current.get(clip.id))
        .find((el): el is HTMLVideoElement => !!el) ||
      findExistingElementForUrl(mediaUrl, videoElementsRef, freeByUrl)
    const inTimelineRange = isVideoActiveAtTimelineTime(
      primary,
      videosList,
      playbackTime,
      imagesList
    )

    if (!video) {
      video = createPreviewVideoElement(primary, mediaUrl, inTimelineRange ? 'auto' : 'metadata')
    } else {
      attachPreviewVideoFrameListeners(video)
      if (!videoElementSrcMatches(video, mediaUrl)) {
        invalidatePreviewVideoFrameCache(video)
        setVideoCrossOriginForUrl(video, mediaUrl)
        video.pause()
        video.src = resolvedVideoElementSrc(mediaUrl)
        video.load()
      } else if (inTimelineRange && video.preload !== 'auto') {
        video.preload = 'auto'
      }
    }

    for (const clip of clips) {
      const prevUrl = lastMediaUrlByClipId.get(clip.id)
      if (prevUrl && prevUrl !== mediaUrl) {
        const oldEl = videoElementsRef.current.get(clip.id)
        videoElementsRef.current.delete(clip.id)
        if (oldEl && oldEl !== video) {
          parkElementIfUnused(oldEl, videoElementsRef, freeByUrl)
        }
      }
      lastMediaUrlByClipId.set(clip.id, mediaUrl)
      videoElementsRef.current.set(clip.id, video)
      releaseDeadlinesRef.current.delete(clip.id)
      if (clip.id === primary.id) {
        video.muted = clip.muted
      }
    }
  })

  freeByUrl.forEach((el) => {
    let stillUsed = false
    for (const other of videoElementsRef.current.values()) {
      if (other === el) {
        stillUsed = true
        break
      }
    }
    if (!stillUsed) destroyPreviewVideoElement(el)
  })

  enforceMaxActivePreviewVideos(
    playbackTime,
    videosList,
    videoElementsRef,
    persistenceCanvasesRef,
    releaseDeadlinesRef,
    maxActive
  )
}
