export const TIMELINE_POSITION_DECIMALS = 3

export function quantizeTimelineSeconds(t: number): number {
  const f = 10 ** TIMELINE_POSITION_DECIMALS
  return Math.round(t * f) / f
}

export function quantizeOptionalTimelineSeconds(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return n
  return quantizeTimelineSeconds(n)
}
