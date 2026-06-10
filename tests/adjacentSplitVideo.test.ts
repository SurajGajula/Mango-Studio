import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  ADJACENT_SPLIT_BOUNDARY_SEC,
  findAdjacentSameSourcePredecessor,
  findAdjacentSameSourceSuccessor,
  isSameSourceSplitPair,
  isVideoActiveAtTimelineTime,
  videoElapsedForMapping,
  videoTimelineActiveEnd,
} from '@/app/lib/adjacentSplitVideo'
import { buildVideoSplitSegmentFields } from '@/app/lib/splitVideoSegments'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import { checkTransition, getSortedRowItems } from '@/app/lib/renderUtils'

describe('adjacentSplitVideo', () => {
  it('extends active end across same-source split boundaries', () => {
    const original = new VideoClass('v1', 'clip', '/x.mp4', 6, 0, undefined, undefined, 6, 0, 0)
    const [firstFields, secondFields] = buildVideoSplitSegmentFields(original, [0, 3, 6])
    const first = original.copy({
      id: 'v1',
      duration: firstFields.duration,
      trimEnd: firstFields.trimEnd,
      sourceDuration: firstFields.sourceDuration,
    })
    const second = original.copy({
      id: 'v2',
      duration: secondFields.duration,
      timestamp: secondFields.timestamp,
      trimStart: secondFields.trimStart,
      trimEnd: secondFields.trimEnd,
      sourceDuration: secondFields.sourceDuration,
      transition: 'fade',
      transitionDuration: 1,
    })
    const videos = [first, second]
    const boundary = second.timestamp
    expect(isVideoActiveAtTimelineTime(first, videos, boundary)).toBe(true)
    expect(isVideoActiveAtTimelineTime(first, videos, boundary + ADJACENT_SPLIT_BOUNDARY_SEC - 0.001)).toBe(true)
    expect(isVideoActiveAtTimelineTime(first, videos, boundary + ADJACENT_SPLIT_BOUNDARY_SEC)).toBe(false)
    expect(findAdjacentSameSourceSuccessor(videos, first)?.id).toBe('v2')
    expect(findAdjacentSameSourcePredecessor(videos, second)?.id).toBe('v1')
    expect(isSameSourceSplitPair(first, second)).toBe(true)
    expect(videoElapsedForMapping(first, boundary + 0.01)).toBe(manifestVideoTimelineSpanSeconds(first))
    expect(videoTimelineActiveEnd(first, videos)).toBeGreaterThan(first.timestamp + manifestVideoTimelineSpanSeconds(first))
  })

  it('skips non-flash transitions between same-source split segments', () => {
    const a = new VideoClass('v1', 'clip', '/x.mp4', 3, 0, undefined, undefined, 6, 0, 3)
    const b = new VideoClass('v2', 'clip', '/x.mp4', 3, 3, undefined, undefined, 6, 3, 0).copy({
      transition: 'fade',
      transitionDuration: 1,
    })
    const items = getSortedRowItems(0, [a, b], [])
    const tr = checkTransition(items[0], items[1], 3.1)
    expect(tr.transitionActive).toBe(false)
  })

  it('allows flash transitions between same-source split segments', () => {
    const a = new VideoClass('v1', 'clip', '/x.mp4', 3, 0, undefined, undefined, 6, 0, 3)
    const b = new VideoClass('v2', 'clip', '/x.mp4', 3, 3, undefined, undefined, 6, 3, 0).copy({
      transition: 'flash',
      transitionDuration: 0.2,
      transitionColor: '#FFFFFF',
    })
    const items = getSortedRowItems(0, [a, b], [])
    const tr = checkTransition(items[0], items[1], 3.05)
    expect(tr.transitionActive).toBe(true)
    expect(tr.progress).toBeGreaterThan(0)
  })
})
