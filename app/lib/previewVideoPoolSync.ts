import type { MutableRefObject } from 'react'
import { isTimelineScrubbingRef } from '@/app/lib/playbackClock'
import { attachPreviewVideoFrameListeners, invalidatePreviewVideoFrameCache } from '@/app/lib/previewVideoFrameCache'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import {
  isVideoActiveAtTimelineTime,
  videoTimelineActiveEnd,
} from '@/app/lib/adjacentSplitVideo'
import {
  videoPlaybackContentKey,
  videoPlaybackMediaUrl,
  videoSourceTrimBase,
} from '@/app/lib/videoPlaybackSource'
import type { VideoClass } from '@/app/models/VideoClass'
import type { ImageClass } from '@/app/models/ImageClass'
import { useManifestStore } from '@/app/stores/manifestStore'

export const MAX_ACTIVE_PREVIEW_VIDEOS = 4
export const MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS = 3
export const PREVIEW_VIDEO_RELEASE_GRACE_MS = 500
export const PREVIEW_VIDEO_PREFETCH_SEC = 10
export const PREVIEW_VIDEO_PREFETCH_SEC_MANY_CLIPS = 4
export const PREVIEW_VIDEO_SCRUB_PREFETCH_SEC = 8
export const PREVIEW_VIDEO_SCRUB_PREFETCH_SEC_MANY_CLIPS = 5
const MANY_TIMELINE_VIDEOS = 3

function prefetchLeadForPool(videoCount: number, scrubbing: boolean): number {
  if (scrubbing) {
    return videoCount > MANY_TIMELINE_VIDEOS
      ? PREVIEW_VIDEO_SCRUB_PREFETCH_SEC_MANY_CLIPS
      : PREVIEW_VIDEO_SCRUB_PREFETCH_SEC
  }
  return videoCount > MANY_TIMELINE_VIDEOS
    ? PREVIEW_VIDEO_PREFETCH_SEC_MANY_CLIPS
    : PREVIEW_VIDEO_PREFETCH_SEC
}

function maxActivePreviewVideos(videoCount: number): number {
  return videoCount > 6 ? MAX_ACTIVE_PREVIEW_VIDEOS_MANY_CLIPS : MAX_ACTIVE_PREVIEW_VIDEOS
}

type PersistenceCanvasMap = Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>

const lastPlaybackContentKeyByClipId = new Map<string, string>()

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

export function releasePreviewVideoElement(
  id: string,
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>
) {
  releaseDeadlinesRef.current.delete(id)
  const video = videoElementsRef.current.get(id)
  if (!video) {
    persistenceCanvasesRef.current.delete(id)
    return
  }
  video.pause()
  video.src = ''
  video.load()
  videoElementsRef.current.delete(id)
  persistenceCanvasesRef.current.delete(id)
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

function enforceMaxActivePreviewVideos(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>,
  maxActive: number
) {
  while (videoElementsRef.current.size > maxActive) {
    let farthestId: string | null = null
    let farthestDist = -1
    videoElementsRef.current.forEach((_, id) => {
      const clip = videosList.find((v) => v.id === id)
      if (!clip) {
        farthestId = id
        farthestDist = Number.POSITIVE_INFINITY
        return
      }
      const dist = clipDistanceFromPlayhead(clip, playbackTime, videosList)
      if (dist > farthestDist) {
        farthestDist = dist
        farthestId = id
      }
    })
    if (!farthestId) break
    releasePreviewVideoElement(farthestId, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
  }
}

export function purgeOffscreenPreviewVideos(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>,
  releaseDeadlinesRef: MutableRefObject<Map<string, number>>,
  imagesList: ImageClass[] = []
) {
  const prefetchLead = prefetchLeadForPool(videosList.length, false)
  const ids = [...videoElementsRef.current.keys()]
  for (const id of ids) {
    const clip = videosList.find((v) => v.id === id)
    if (!clip) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
      continue
    }
    const inTimelineRange = isVideoActiveAtTimelineTime(clip, videosList, playbackTime, imagesList)
    const prefetchBeforeStart =
      playbackTime < clip.timestamp && clip.timestamp - playbackTime <= prefetchLead
    if (!inTimelineRange && !prefetchBeforeStart) {
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
    maxActivePreviewVideos(videosList.length)
  )
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
  const prefetchLead = prefetchLeadForPool(videosList.length, isTimelineScrubbingRef.current)
  const maxActive = maxActivePreviewVideos(videosList.length)

  releaseDeadlinesRef.current.forEach((deadline, id) => {
    if (now < deadline) return
    if (!videoElementsRef.current.has(id)) {
      releaseDeadlinesRef.current.delete(id)
      return
    }
    const clip = videosList.find((v) => v.id === id)
    if (!clip) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
      return
    }
    const inTimelineRange = isVideoActiveAtTimelineTime(clip, videosList, playbackTime, imagesList)
    const prefetchBeforeStart =
      playbackTime < clip.timestamp && clip.timestamp - playbackTime <= prefetchLead
    if (!inTimelineRange && !prefetchBeforeStart) {
      releasePreviewVideoElement(id, videoElementsRef, persistenceCanvasesRef, releaseDeadlinesRef)
    } else {
      releaseDeadlinesRef.current.delete(id)
    }
  })

  const sortedVideos = [...videosList].sort((a, b) => a.timestamp - b.timestamp)
  const currentIds = new Set(sortedVideos.map((v) => v.id))

  lastPlaybackContentKeyByClipId.forEach((_, id) => {
    if (!currentIds.has(id)) lastPlaybackContentKeyByClipId.delete(id)
  })

  const removedElements = new Map<string, HTMLVideoElement>()
  videoElementsRef.current.forEach((el, id) => {
    if (!currentIds.has(id)) {
      releaseDeadlinesRef.current.delete(id)
      removedElements.set(el.src, el)
      videoElementsRef.current.delete(id)
      persistenceCanvasesRef.current.delete(id)
    }
  })

  sortedVideos.forEach((clip) => {
    const clipSrc = videoPlaybackMediaUrl(clip)
    const contentKey = videoPlaybackContentKey(clip)
    const prevContentKey = lastPlaybackContentKeyByClipId.get(clip.id)
    const contentChanged = prevContentKey !== undefined && prevContentKey !== contentKey
    lastPlaybackContentKeyByClipId.set(clip.id, contentKey)

    const inTimelineRange = isVideoActiveAtTimelineTime(clip, videosList, playbackTime, imagesList)
    const prefetchBeforeStart =
      playbackTime < clip.timestamp && clip.timestamp - playbackTime <= prefetchLead
    const isNearPlayhead = inTimelineRange || prefetchBeforeStart
    let video = videoElementsRef.current.get(clip.id)

    if (!isNearPlayhead && !video) return

    if (isNearPlayhead) {
      releaseDeadlinesRef.current.delete(clip.id)
    }

    if (video && contentChanged) {
      releasePreviewVideoElement(
        clip.id,
        videoElementsRef,
        persistenceCanvasesRef,
        releaseDeadlinesRef
      )
      video = undefined
    }

    if (!video && clipSrc && isNearPlayhead) {
      const resolvedSrc = resolvedVideoElementSrc(clipSrc)
      video =
        removedElements.get(resolvedMediaHref(resolvedSrc)) ||
        removedElements.get(resolvedMediaHref(clipSrc)) ||
        removedElements.get(resolvedSrc) ||
        removedElements.get(clipSrc)

      if (video) {
        removedElements.delete(video.src)
        invalidatePreviewVideoFrameCache(video)
        setVideoCrossOriginForUrl(video, clipSrc)
        attachPreviewVideoFrameListeners(video)
        if (!videoElementSrcMatches(video, clipSrc)) {
          video.pause()
          video.src = resolvedSrc
          video.load()
        } else {
          const trimBase = videoSourceTrimBase(clip)
          if (Math.abs(video.currentTime - trimBase) > 0.05) {
            video.currentTime = trimBase
          }
        }
      } else {
        video = document.createElement('video')
        video.preload = inTimelineRange ? 'auto' : 'metadata'
        video.playsInline = true
        setVideoCrossOriginForUrl(video, clipSrc)
        video.src = resolvedSrc
        video.onloadedmetadata = () => {
          const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
          if (!currentClip) return
          const elDur = video!.duration
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
          if (Math.abs(video!.currentTime - trimBase) > 0.05) {
            video!.currentTime = trimBase
          }
        }
      }
      videoElementsRef.current.set(clip.id, video)
      attachPreviewVideoFrameListeners(video)
    } else if (video && clipSrc && !videoElementSrcMatches(video, clipSrc) && isNearPlayhead) {
      video.pause()
      invalidatePreviewVideoFrameCache(video)
      setVideoCrossOriginForUrl(video, clipSrc)
      video.src = resolvedVideoElementSrc(clipSrc)
      video.load()
    } else if (video && !isNearPlayhead) {
      const deadline = releaseDeadlinesRef.current.get(clip.id)
      if (isTimelineScrubbingRef.current) {
        if (!deadline) {
          releaseDeadlinesRef.current.set(clip.id, now + PREVIEW_VIDEO_RELEASE_GRACE_MS)
        }
        return
      }
      if (deadline && now < deadline) return
      const srcActive = (video.currentSrc || video.src || '').length > 0
      if (srcActive) {
        video.pause()
        video.src = ''
        video.load()
      }
      videoElementsRef.current.delete(clip.id)
      persistenceCanvasesRef.current.delete(clip.id)
      releaseDeadlinesRef.current.delete(clip.id)
      video = undefined
    }

    if (video && video.muted !== clip.muted) {
      video.muted = clip.muted
    }
  })

  removedElements.forEach((el) => {
    el.pause()
    el.src = ''
    el.load()
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
