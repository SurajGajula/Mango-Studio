import { VideoClass } from '@/app/models/VideoClass'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'

export type VideoSplitSegmentFields = {
  trimStart: number
  trimEnd: number
  duration: number
  timestamp: number
  sourceDuration: number
}

export function buildVideoSplitSegmentFields(
  video: VideoClass,
  localBoundaries: number[]
): VideoSplitSegmentFields[] {
  const speed = video.playbackSpeed ?? 1
  const origDuration = quantizeTimelineSeconds(video.originalDuration ?? video.duration ?? 0)
  const parentTrimStart = quantizeTimelineSeconds(video.trimStart ?? 0)
  const parentTrimEnd = quantizeTimelineSeconds(video.trimEnd ?? 0)
  const sourceEnd = quantizeTimelineSeconds(origDuration - parentTrimEnd)

  const sourceBoundaries = localBoundaries.map((localT, i) => {
    if (i === 0) return parentTrimStart
    if (i === localBoundaries.length - 1) return sourceEnd
    return quantizeTimelineSeconds(parentTrimStart + localT * speed)
  })

  const segments: VideoSplitSegmentFields[] = []
  let timelineCursor = quantizeTimelineSeconds(video.timestamp)

  for (let i = 0; i < sourceBoundaries.length - 1; i++) {
    const segTrimStart = sourceBoundaries[i]
    const segTrimEnd = quantizeTimelineSeconds(origDuration - sourceBoundaries[i + 1])
    const sourceDuration = quantizeTimelineSeconds(Math.max(0, origDuration - segTrimStart - segTrimEnd))
    const duration = quantizeTimelineSeconds(sourceDuration / speed)

    segments.push({
      trimStart: segTrimStart,
      trimEnd: segTrimEnd,
      duration,
      timestamp: timelineCursor,
      sourceDuration,
    })

    timelineCursor = quantizeTimelineSeconds(timelineCursor + duration)
  }

  return segments
}

export function videoLocalBoundariesFromSplitTimes(
  video: VideoClass,
  times: number[]
): number[] {
  const timelineDuration = manifestVideoTimelineSpanSeconds(video)
  const epsilon = 1e-6
  const relTimes = times
    .map((t) => t - video.timestamp)
    .filter((t) => t > epsilon && t < timelineDuration - epsilon)
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1] > epsilon)

  return [0, ...relTimes, timelineDuration]
}
