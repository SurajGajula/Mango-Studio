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
