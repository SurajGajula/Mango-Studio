import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  buildVideoSplitSegmentFields,
  videoLocalBoundariesFromSplitTimes,
} from '@/app/lib/splitVideoSegments'
import {
  manifestVideoTimelineSpanSeconds,
  videoTrimmedSourceSpanSeconds,
} from '@/app/lib/timeUtils'

describe('buildVideoSplitSegmentFields', () => {
  it('keeps equal thirds contiguous on the timeline', () => {
    const video = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      10.001,
      0,
      undefined,
      undefined,
      10.001,
      0,
      0
    )
    const span = manifestVideoTimelineSpanSeconds(video)
    const boundaries = [0, span / 3, (2 * span) / 3, span]
    const segments = buildVideoSplitSegmentFields(video, boundaries)

    expect(segments).toHaveLength(3)
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i]
      const next = segments[i + 1]
      expect(current.timestamp + manifestVideoTimelineSpanSeconds(
        video.copy({
          duration: current.duration,
          trimStart: current.trimStart,
          trimEnd: current.trimEnd,
          sourceDuration: current.sourceDuration,
        })
      )).toBe(next.timestamp)
      expect(current.trimStart + videoTrimmedSourceSpanSeconds(
        video.copy({
          duration: current.duration,
          trimStart: current.trimStart,
          trimEnd: current.trimEnd,
          sourceDuration: current.sourceDuration,
        })
      )).toBe(next.trimStart)
    }

    const totalSpan = segments.reduce((sum, seg) => sum + seg.duration, 0)
    expect(totalSpan).toBe(span)
  })

  it('derives local boundaries from absolute split times', () => {
    const video = new VideoClass('v1', 'clip', '/x.mp4', 6, 2, undefined, undefined, 6, 0, 0)
    const boundaries = videoLocalBoundariesFromSplitTimes(video, [4, 6])
    expect(boundaries).toEqual([0, 2, 4, 6])
  })
})
