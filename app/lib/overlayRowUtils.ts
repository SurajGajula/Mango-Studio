import { useManifestStore } from '@/app/stores/manifestStore'

export function findFreeVisualOverlayRow(start: number, end: number): number {
  const s = useManifestStore.getState()
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

export function findFreeAudioOverlayRow(start: number, end: number): number {
  const s = useManifestStore.getState()
  let row = 1
  while (true) {
    const hasVisual =
      s.videos.some((v) => v.row === row && v.isOverlay) ||
      s.images.some((img) => img.row === row && !img.isMainTrack) ||
      s.texts.some((t) => t.row === row) ||
      s.effects.some((e) => e.row === row)
    if (hasVisual) {
      row++
      continue
    }
    const rowAudios = s.audios.filter((a) => a.row === row)
    const hasOverlap = rowAudios.some((a) => start < a.endTime && end > a.startTime)
    if (!hasOverlap) return row
    row++
  }
}
