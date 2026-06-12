import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import { videoPlaybackMediaUrl } from '@/app/lib/videoPlaybackSource'
import { getSortedRowClips, isRowClipActiveAtTimelineTime } from '@/app/lib/timelineClipAdjacency'

export const ADJACENT_SPLIT_BOUNDARY_SEC = 2 / 60
export const ADJACENT_SPLIT_EPSILON = 0.011

export function videoMediaUrl(v: VideoClass): string {
  if (v.sourceUrl) return v.sourceUrl
  return videoPlaybackMediaUrl(v)
}

export function findAdjacentSameSourceSuccessor(
  videos: VideoClass[],
  video: VideoClass,
  epsilon = ADJACENT_SPLIT_EPSILON
): VideoClass | null {
  const src = videoMediaUrl(video)
  if (!src) return null
  const end = video.timestamp + manifestVideoTimelineSpanSeconds(video)
  let best: VideoClass | null = null
  let bestStart = Number.POSITIVE_INFINITY
  for (const v of videos) {
    if (v.id === video.id || v.row !== video.row) continue
    if (videoMediaUrl(v) !== src) continue
    const gap = v.timestamp - end
    if (gap >= -1e-6 && gap < epsilon && v.timestamp < bestStart) {
      best = v
      bestStart = v.timestamp
    }
  }
  return best
}

export function findAdjacentSameSourcePredecessor(
  videos: VideoClass[],
  video: VideoClass,
  epsilon = ADJACENT_SPLIT_EPSILON
): VideoClass | null {
  const src = videoMediaUrl(video)
  if (!src) return null
  const start = video.timestamp
  let best: VideoClass | null = null
  let bestStart = -1
  for (const v of videos) {
    if (v.id === video.id || v.row !== video.row) continue
    if (videoMediaUrl(v) !== src) continue
    const vEnd = v.timestamp + manifestVideoTimelineSpanSeconds(v)
    const gap = start - vEnd
    if (gap >= -1e-6 && gap < epsilon && v.timestamp > bestStart) {
      best = v
      bestStart = v.timestamp
    }
  }
  return best
}

export function videoTimelineActiveEnd(
  video: VideoClass,
  videos: VideoClass[],
  boundaryHoldSec = ADJACENT_SPLIT_BOUNDARY_SEC
): number {
  const end = video.timestamp + manifestVideoTimelineSpanSeconds(video)
  if (findAdjacentSameSourceSuccessor(videos, video)) {
    return end + boundaryHoldSec
  }
  return end
}

export function isVideoActiveAtTimelineTime(
  video: VideoClass,
  videos: VideoClass[],
  time: number,
  images?: ImageClass[]
): boolean {
  const span = manifestVideoTimelineSpanSeconds(video)
  if (span <= 0) return false
  if (time < video.timestamp) return false
  const rowItems = getSortedRowClips(video.row, videos, images ?? [])
  const item = rowItems.find((entry) => entry.id === video.id)
  if (!item) return time < videoTimelineActiveEnd(video, videos)
  return isRowClipActiveAtTimelineTime(rowItems, item, time, videos)
}

export function isImageActiveAtTimelineTime(
  image: ImageClass,
  videos: VideoClass[],
  images: ImageClass[],
  time: number
): boolean {
  const duration = image.endTime - image.startTime
  if (!(duration > 0)) return false
  if (time < image.startTime) return false
  const rowItems = getSortedRowClips(image.row, videos, images)
  const item = rowItems.find((entry) => entry.id === image.id)
  if (!item) return time < image.endTime
  return isRowClipActiveAtTimelineTime(rowItems, item, time, videos)
}

export function isSameSourceSplitPair(a: VideoClass, b: VideoClass): boolean {
  const src = videoMediaUrl(a)
  if (!src || src !== videoMediaUrl(b)) return false
  if (a.row !== b.row) return false
  const aEnd = a.timestamp + manifestVideoTimelineSpanSeconds(a)
  const gap = b.timestamp - aEnd
  return gap >= -1e-6 && gap < ADJACENT_SPLIT_EPSILON
}

export function videoElapsedForMapping(video: VideoClass, timelineTime: number): number {
  const span = manifestVideoTimelineSpanSeconds(video)
  return Math.max(0, Math.min(timelineTime - video.timestamp, span))
}
