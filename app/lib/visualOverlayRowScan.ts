import type { ManifestStore } from '@/app/stores/manifest/types'

export function findFreeVisualOverlayRowFromState(
  s: Pick<ManifestStore, 'audios' | 'images' | 'videos' | 'texts' | 'effects'>,
  start: number,
  end: number
): number {
  let row = 1
  while (true) {
    if (s.audios.some((a) => a.row === row && a.isOverlay)) {
      row++
      continue
    }
    const items = [
      ...s.images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
      ...s.videos.map((v) => ({
        startTime: v.timestamp,
        endTime: v.timestamp + (v.duration ?? 0),
        row: v.row,
      })),
      ...s.texts.map((t) => ({ startTime: t.startTime, endTime: t.endTime, row: t.row })),
      ...s.effects.map((e) => ({ startTime: e.startTime, endTime: e.endTime, row: e.row })),
    ]
    const rowItems = items.filter((i) => i.row === row)
    const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
    if (!hasOverlap) return row
    row++
  }
}
