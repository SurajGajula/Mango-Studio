import { snapToMarkers } from '@/app/lib/snapToMarkers'

export function toTimeDelta(
  clientX: number,
  initialMouseX: number,
  timelineWidth: number,
  totalWithPadding: number
): number {
  return ((clientX - initialMouseX) / timelineWidth) * totalWithPadding
}

export function snapStartOrEnd(
  start: number,
  duration: number,
  targets: number[],
  threshold: number
): number {
  const snappedStart = snapToMarkers(start, targets, threshold)
  if (snappedStart !== start) return snappedStart
  const end = start + duration
  const snappedEnd = snapToMarkers(end, targets, threshold)
  if (snappedEnd !== end) return snappedEnd - duration
  return start
}

export function clampMinDuration(start: number, end: number, min: number): { start: number; end: number } {
  return {
    start: Math.min(start, end - min),
    end: Math.max(end, start + min),
  }
}

export function applyBounds(value: number, min?: number, max?: number): number {
  let v = value
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}
