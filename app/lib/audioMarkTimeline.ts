import { AudioClass } from '@/app/models/AudioClass'

export function audioMarkTimelineEntries(
  audioItem: AudioClass,
  totalDuration: number
): { id: string; timelinePos: number }[] {
  const { trimStart, trimEnd, originalDuration, startTime, marks } = audioItem
  const maxSource = originalDuration - trimEnd
  return marks
    .filter((m) => m.t >= trimStart && m.t <= maxSource)
    .map((m) => ({ id: m.id, timelinePos: startTime + (m.t - trimStart) }))
    .filter((e) => e.timelinePos <= totalDuration)
}

export function audioMarkTimelinePositions(audioItem: AudioClass, totalDuration: number): number[] {
  return audioMarkTimelineEntries(audioItem, totalDuration).map((e) => e.timelinePos)
}
