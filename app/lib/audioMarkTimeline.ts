import { AudioClass } from '@/app/models/AudioClass'

export function audioMarkTimelinePositions(audioItem: AudioClass, totalDuration: number): number[] {
  const { trimStart, trimEnd, originalDuration, startTime, marks } = audioItem
  const maxSource = originalDuration - trimEnd
  return marks
    .filter((t) => t >= trimStart && t <= maxSource)
    .map((t) => startTime + (t - trimStart))
    .filter((timelinePos) => timelinePos <= totalDuration)
}
