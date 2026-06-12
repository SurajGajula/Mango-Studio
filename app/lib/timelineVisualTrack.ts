import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { TIMELINE_CLIP_GAP_EPSILON } from '@/app/lib/timelineClipAdjacency'

export type VisualTrackItem = {
  id: string
  type: 'video' | 'image'
  startTime: number
  endTime: number
  width: number
  height: number
  transition: string
}

const DIMENSION_EPSILON = 0.01

export function toVisualTrackItem(item: VideoClass | ImageClass, type: 'video' | 'image'): VisualTrackItem {
  return type === 'video'
    ? {
        id: item.id,
        type,
        startTime: (item as VideoClass).timestamp,
        endTime: (item as VideoClass).timestamp + ((item as VideoClass).duration ?? 0),
        width: (item as VideoClass).width,
        height: (item as VideoClass).height,
        transition: (item as VideoClass).transition ?? 'none',
      }
    : {
        id: item.id,
        type,
        startTime: (item as ImageClass).startTime,
        endTime: (item as ImageClass).endTime,
        width: (item as ImageClass).width,
        height: (item as ImageClass).height,
        transition: (item as ImageClass).transition ?? 'none',
      }
}

export function hasMatchingAspectAndSize(a: VisualTrackItem, b: VisualTrackItem): boolean {
  if (Math.abs(a.width - b.width) > DIMENSION_EPSILON) return false
  if (Math.abs(a.height - b.height) > DIMENSION_EPSILON) return false
  const aAspect = a.height !== 0 ? a.width / a.height : 0
  const bAspect = b.height !== 0 ? b.width / b.height : 0
  return Math.abs(aAspect - bAspect) <= DIMENSION_EPSILON
}

export function canEditTransitionBetween(
  previous: VisualTrackItem | null,
  current: VisualTrackItem,
  adjacencyEpsilon = TIMELINE_CLIP_GAP_EPSILON
): boolean {
  if (!previous) return false
  if (Math.abs(current.startTime - previous.endTime) >= adjacencyEpsilon) return false
  return hasMatchingAspectAndSize(previous, current)
}

export function buildManifestNumberById<T>(
  items: T[],
  getId: (item: T) => string,
  getStartTime: (item: T) => number
): Map<string, number> {
  const sorted = [...items].sort((a, b) => getStartTime(a) - getStartTime(b))
  const map = new Map<string, number>()
  sorted.forEach((item, index) => {
    map.set(getId(item), index + 1)
  })
  return map
}
