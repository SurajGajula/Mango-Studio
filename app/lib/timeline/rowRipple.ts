export interface TimelineInterval {
  start: number
  end: number
}

export interface RowItem {
  id: string
  startTime: number
  endTime: number
}

export function overlapsAny(
  myStart: number,
  myEnd: number,
  intervals: TimelineInterval[],
  threshold: number
): boolean {
  for (const other of intervals) {
    if (myStart < other.end - threshold && myEnd > other.start + threshold) {
      return true
    }
  }
  return false
}

export type RowOccupancyKind = 'video' | 'image' | 'text' | 'audio' | 'effect'

export type ManifestRowOccupancyState = {
  videos: ReadonlyArray<{ id: string; row: number; timestamp: number; duration?: number | null; isOverlay?: boolean }>
  images: ReadonlyArray<{ id: string; row: number; startTime: number; endTime: number; isMainTrack?: boolean }>
  texts: ReadonlyArray<{ id: string; row: number; startTime: number; endTime: number }>
  effects: ReadonlyArray<{ id: string; row: number; startTime: number; endTime: number }>
  audios: ReadonlyArray<{ id: string; row: number; startTime: number; endTime: number; isOverlay?: boolean }>
}

export function occupancyIntervalsOnRow(
  state: ManifestRowOccupancyState,
  row: number,
  excludeKind: RowOccupancyKind | null,
  excludeId: string | null
): TimelineInterval[] {
  const out: TimelineInterval[] = []
  const skip = (k: RowOccupancyKind, id: string) => excludeKind === k && excludeId === id
  const mainAudioLane = row === 0 && excludeKind === 'audio'
  const visualTimelineLane = row === 0 && excludeKind !== 'audio'
  for (const v of state.videos) {
    if (v.row !== row || skip('video', v.id)) continue
    if (mainAudioLane) continue
    out.push({ start: v.timestamp, end: v.timestamp + (v.duration ?? 0) })
  }
  for (const img of state.images) {
    if (img.row !== row || skip('image', img.id)) continue
    if (mainAudioLane) continue
    out.push({ start: img.startTime, end: img.endTime })
  }
  for (const t of state.texts) {
    if (t.row !== row || skip('text', t.id)) continue
    if (mainAudioLane) continue
    out.push({ start: t.startTime, end: t.endTime })
  }
  for (const e of state.effects) {
    if (e.row !== row || skip('effect', e.id)) continue
    if (mainAudioLane) continue
    out.push({ start: e.startTime, end: e.endTime })
  }
  for (const a of state.audios) {
    if (a.row !== row || skip('audio', a.id)) continue
    if (mainAudioLane && a.isOverlay) continue
    if (visualTimelineLane && !a.isOverlay) continue
    out.push({ start: a.startTime, end: a.endTime })
  }
  return out
}

export function shouldRippleExpansionInRow(
  fromTime: number,
  toTime: number,
  rowItems: RowItem[],
  threshold: number
): boolean {
  if (toTime <= fromTime) return false
  return rowItems.some((item) => item.startTime < toTime - threshold && item.endTime > fromTime + threshold)
}

export function shiftItemsForwardInRow(
  rowItems: RowItem[],
  fromTime: number,
  delta: number,
  threshold: number
): Array<{ id: string; shiftAmount: number }> {
  const result: Array<{ id: string; shiftAmount: number }> = []
  if (delta <= 0) return result
  const items = [...rowItems].sort((a, b) => a.startTime - b.startTime)
  let frontier = fromTime + delta

  for (const item of items) {
    if (item.endTime <= fromTime + threshold) continue
    if (item.startTime > frontier + threshold) continue
    const pushBy = frontier - item.startTime
    if (pushBy > threshold) {
      result.push({ id: item.id, shiftAmount: pushBy })
      frontier = item.endTime + pushBy
    } else {
      frontier = Math.max(frontier, item.endTime)
    }
  }
  return result
}
