import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import {
  ADJACENT_SPLIT_BOUNDARY_SEC,
  findAdjacentSameSourceSuccessor,
} from '@/app/lib/adjacentSplitVideo'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'

export const TIMELINE_CLIP_GAP_EPSILON = 3 / 60

export type TimelineRowClip = {
  id: string
  type: 'video' | 'image'
  startTime: number
  duration: number
  item: VideoClass | ImageClass
}

export function getSortedRowClips(
  row: number,
  videos: VideoClass[],
  images: ImageClass[]
): TimelineRowClip[] {
  return [
    ...videos
      .filter((video) => video.row === row)
      .map((video) => ({
        id: video.id,
        type: 'video' as const,
        item: video,
        startTime: video.timestamp,
        duration: manifestVideoTimelineSpanSeconds(video),
      })),
    ...images
      .filter((image) => image.row === row)
      .map((image) => ({
        id: image.id,
        type: 'image' as const,
        item: image,
        startTime: image.startTime,
        duration: image.duration,
      })),
  ].sort((a, b) => a.startTime - b.startTime)
}

export function rowClipTimelineEnd(item: TimelineRowClip): number {
  return item.startTime + item.duration
}

export function gapBetweenRowClips(a: TimelineRowClip, b: TimelineRowClip): number {
  return b.startTime - rowClipTimelineEnd(a)
}

export function isSmallGapBetweenRowClips(
  a: TimelineRowClip,
  b: TimelineRowClip,
  epsilon = TIMELINE_CLIP_GAP_EPSILON
): boolean {
  const gap = gapBetweenRowClips(a, b)
  return gap >= -1e-6 && gap < epsilon
}

export function clipsAreEffectivelyAdjacent(
  a: TimelineRowClip,
  b: TimelineRowClip,
  epsilon = TIMELINE_CLIP_GAP_EPSILON
): boolean {
  return isSmallGapBetweenRowClips(a, b, epsilon)
}

export function findNextRowClip(items: TimelineRowClip[], item: TimelineRowClip): TimelineRowClip | null {
  const idx = items.findIndex((entry) => entry.id === item.id)
  if (idx < 0 || idx >= items.length - 1) return null
  return items[idx + 1]
}

export function rowClipEffectiveTimelineEnd(
  items: TimelineRowClip[],
  item: TimelineRowClip,
  videos?: VideoClass[]
): number {
  const nominal = rowClipTimelineEnd(item)
  let effective = nominal

  if (item.type === 'video' && videos) {
    const video = item.item as VideoClass
    if (findAdjacentSameSourceSuccessor(videos, video)) {
      effective = Math.max(effective, nominal + ADJACENT_SPLIT_BOUNDARY_SEC)
    }
  }

  const next = findNextRowClip(items, item)
  if (next && isSmallGapBetweenRowClips(item, next)) {
    effective = Math.max(effective, next.startTime)
  }

  return effective
}

export function isRowClipActiveAtTimelineTime(
  items: TimelineRowClip[],
  item: TimelineRowClip,
  time: number,
  videos?: VideoClass[]
): boolean {
  if (!(item.duration > 0)) return false
  if (time < item.startTime) return false
  return time < rowClipEffectiveTimelineEnd(items, item, videos)
}

export function rowClipElapsedAtTime(item: TimelineRowClip, time: number): number {
  const elapsed = time - item.startTime
  return Math.max(0, Math.min(elapsed, item.duration))
}
