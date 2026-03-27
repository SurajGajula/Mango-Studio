export function snapToMarkers(
  time: number,
  userMarks: number[],
  threshold = 0.1
): number {
  let best = time
  let bestDist = threshold
  for (const mark of userMarks) {
    const dist = Math.abs(mark - time)
    if (dist < bestDist) {
      best = mark
      bestDist = dist
    }
  }
  return best
}
