import { useManifestStore } from '@/app/stores/manifestStore'
import { findFreeVisualOverlayRowFromState } from '@/app/lib/visualOverlayRowScan'

export { findFreeVisualOverlayRowFromState } from '@/app/lib/visualOverlayRowScan'

export function findFreeVisualOverlayRow(start: number, end: number): number {
  return findFreeVisualOverlayRowFromState(useManifestStore.getState(), start, end)
}

export function findFreeAudioOverlayRow(start: number, end: number): number {
  const s = useManifestStore.getState()
  let row = 1
  while (true) {
    const hasVisual =
      s.videos.some((v) => v.row === row && v.row > 0) ||
      s.images.some((img) => img.row === row && img.row > 0) ||
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
