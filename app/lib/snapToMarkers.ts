import type { AudioAnalysisResult } from '@/app/stores/audioStore'

function findClosest(time: number, markers: number[], threshold: number): number | null {
  let best: number | null = null
  let bestDist = threshold
  for (const marker of markers) {
    const dist = Math.abs(marker - time)
    if (dist < bestDist) {
      best = marker
      bestDist = dist
    }
  }
  return best
}

export function snapToMarkers(
  time: number,
  analysis: AudioAnalysisResult,
  threshold = 0.1
): number {
  const chorusBoundaries = analysis.choruses.flatMap((c) => [c.start, c.end])

  const priorityGroups = [
    analysis.drops,
    analysis.beats,
    analysis.quarterBeats,
    chorusBoundaries,
  ]

  for (const group of priorityGroups) {
    const snapped = findClosest(time, group, threshold)
    if (snapped !== null) return snapped
  }

  return time
}
