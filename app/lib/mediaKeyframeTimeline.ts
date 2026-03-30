import type { MediaKeyframe } from '@/app/models/mediaKeyframe'

export function keyframeTimelineEntries(
  clipStart: number,
  clipDuration: number,
  keyframes: MediaKeyframe[],
  totalDuration: number
): { id: string; timelinePos: number }[] {
  const d = Math.max(0, clipDuration)
  return keyframes
    .filter((k) => k.t >= 0 && k.t <= d)
    .map((k) => ({ id: k.id, timelinePos: clipStart + k.t }))
    .filter((e) => e.timelinePos <= totalDuration)
}
