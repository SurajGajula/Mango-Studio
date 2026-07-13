import { VideoClass } from '@/app/models/VideoClass'
import {
  isPersistedBlobTokenRef,
  isPlaybackFetchableUrl,
} from '@/app/lib/persistedMediaRefs'

export function isExtractedVideoSegment(video: VideoClass): boolean {
  const source = video.sourceUrl
  const url = video.url
  if (!url || isPersistedBlobTokenRef(url)) return false
  if (!source || url === source) return false
  if (url.startsWith('blob:')) return true
  return isPlaybackFetchableUrl(url)
}

export function shouldPlayExtractedVideoFromSource(video: VideoClass): boolean {
  const source = video.sourceUrl
  if (!source || !isPlaybackFetchableUrl(source)) return false
  const url = video.url
  if (!url) return video.sourceTrimStart != null
  if (url === source) {
    if (video.sourceTrimStart == null) return false
    if ((video.trimStart ?? 0) > 0) return false
    return true
  }
  if (isPersistedBlobTokenRef(url)) return true
  if (!url.startsWith('blob:') && !isPlaybackFetchableUrl(url)) return true
  return false
}

export function videoFullResMediaUrl(video: VideoClass): string {
  if (shouldPlayExtractedVideoFromSource(video)) {
    return video.sourceUrl!
  }
  const url = video.url
  if (url && (url.startsWith('blob:') || isPlaybackFetchableUrl(url))) return url
  if (video.sourceUrl && isPlaybackFetchableUrl(video.sourceUrl)) return video.sourceUrl
  return url || video.sourceUrl || ''
}

export function videoExportMediaUrl(video: VideoClass): string {
  return videoFullResMediaUrl(video)
}

export function videoPlaybackMediaUrl(video: VideoClass): string {
  const proxy = video.proxyUrl
  if (
    proxy &&
    (proxy.startsWith('blob:') || isPlaybackFetchableUrl(proxy)) &&
    !isPersistedBlobTokenRef(proxy)
  ) {
    return proxy
  }
  return videoFullResMediaUrl(video)
}

export function videoSourceTrimBase(video: VideoClass): number {
  if (isExtractedVideoSegment(video)) return 0
  if (shouldPlayExtractedVideoFromSource(video)) {
    return video.sourceTrimStart ?? video.trimStart ?? 0
  }
  return video.trimStart ?? 0
}

export function videoPlaybackOriginalDuration(video: VideoClass): number {
  if (shouldPlayExtractedVideoFromSource(video)) {
    return video.sourceDuration ?? video.originalDuration ?? video.duration ?? 0
  }
  return video.originalDuration ?? video.duration ?? 0
}

export function videoPlaybackTrimEnd(video: VideoClass): number {
  if (isExtractedVideoSegment(video)) return 0
  if (shouldPlayExtractedVideoFromSource(video)) {
    const windowSpan = video.originalDuration ?? 0
    const orig = videoPlaybackOriginalDuration(video)
    const trimBase = videoSourceTrimBase(video)
    return Math.max(0, orig - trimBase - windowSpan)
  }
  return video.trimEnd ?? 0
}

export function videoSourceSpanSeconds(video: VideoClass): number {
  const trimBase = videoSourceTrimBase(video)
  const trimEnd = videoPlaybackTrimEnd(video)
  const orig = videoPlaybackOriginalDuration(video)
  return Math.max(0, orig - trimBase - trimEnd)
}

export function videoEffectiveSourceSpanSeconds(
  video: VideoClass,
  el?: HTMLVideoElement
): number {
  const modelSpan = videoSourceSpanSeconds(video)
  if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return modelSpan
  const trimBase = videoSourceTrimBase(video)
  const trimEnd = videoPlaybackTrimEnd(video)
  const elSpan = Math.max(0, el.duration - trimBase - trimEnd)
  if (isExtractedVideoSegment(video)) {
    if (modelSpan > 0) return Math.min(modelSpan, elSpan)
    return elSpan
  }
  return Math.max(modelSpan, elSpan)
}

export function normalizeVideoAfterSnapshotRevive(video: VideoClass): VideoClass {
  const source = video.sourceUrl
  if (!source || !isPlaybackFetchableUrl(source)) {
    if (!video.url && source) return video.copy({ url: source })
    return video
  }

  const url = video.url
  const blobMissing =
    !url ||
    isPersistedBlobTokenRef(url) ||
    (!url.startsWith('blob:') && !isPlaybackFetchableUrl(url))
  const playingFromSource = url === source || blobMissing

  if (!playingFromSource || video.sourceTrimStart == null) {
    if (blobMissing && isPlaybackFetchableUrl(source)) {
      return video.copy({ url: source })
    }
    return video
  }

  const trimBase = video.sourceTrimStart
  const windowSpan = video.originalDuration ?? video.duration ?? 0
  const fullDuration = video.sourceDuration ?? windowSpan
  const trimEnd = Math.max(0, fullDuration - trimBase - windowSpan)

  return video.copy({
    url: source,
    trimStart: trimBase,
    trimEnd,
    originalDuration: fullDuration,
    sourceUrl: undefined,
    sourceTrimStart: undefined,
    sourceDuration: undefined,
    proxyUrl: undefined,
  })
}

export function uniqueVideoMediaUrlCount(videos: VideoClass[]): number {
  const urls = new Set<string>()
  for (const video of videos) {
    const url = videoPlaybackMediaUrl(video)
    if (url) urls.add(url)
  }
  return urls.size
}
