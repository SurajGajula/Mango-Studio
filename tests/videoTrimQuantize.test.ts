import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  manifestVideoTimelineSpanSeconds,
  syncVideoTrimDerivedFields,
  videoTrimmedSourceSpanSeconds,
} from '@/app/lib/timeUtils'

describe('video trim quantization', () => {
  it('quantizes trimStart and trimEnd to timeline decimals', () => {
    const video = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      0.671,
      6.048,
      undefined,
      undefined,
      7.917,
      0,
      7.2459999999999996
    )
    expect(video.trimEnd).toBe(7.246)
    expect(video.trimStart).toBe(0)
  })

  it('derives timeline span from quantized trims', () => {
    const video = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      0.671,
      6.048,
      undefined,
      undefined,
      7.917,
      0,
      7.2459999999999996
    )
    expect(videoTrimmedSourceSpanSeconds(video)).toBe(0.671)
    expect(manifestVideoTimelineSpanSeconds(video)).toBe(0.671)
  })

  it('split halves share a continuous source boundary', () => {
    const original = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      1.342,
      5.377,
      undefined,
      undefined,
      7.917,
      0,
      0
    )
    const splitPoint = 0.671
    const first = original.copy({
      duration: splitPoint,
      trimEnd: 7.917 - splitPoint,
    })
    const second = original.copy({
      id: 'v2',
      timestamp: 5.377 + splitPoint,
      duration: splitPoint,
      trimStart: splitPoint,
      trimEnd: 7.917 - splitPoint - splitPoint,
    })
    expect(first.timestamp + manifestVideoTimelineSpanSeconds(first)).toBe(second.timestamp)
    expect(first.trimStart + videoTrimmedSourceSpanSeconds(first)).toBe(second.trimStart)
  })

  it('syncs duration from trims when trimEnd changes via updateVideo path', () => {
    const video = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      0.671,
      6.048,
      undefined,
      undefined,
      7.917,
      0,
      7.246
    )
    const synced = syncVideoTrimDerivedFields(video, { trimEnd: 7.2459999999999996 })
    expect(synced.trimEnd).toBe(7.246)
    expect(synced.duration).toBe(0.671)
  })

  it('syncs trimEnd when duration is edited directly', () => {
    const video = new VideoClass(
      'v1',
      'clip',
      '/x.mp4',
      0.672,
      6.719,
      undefined,
      undefined,
      7.964,
      0,
      7.292
    )
    const synced = syncVideoTrimDerivedFields(video, { duration: 0.5 })
    expect(synced.duration).toBe(0.5)
    expect(synced.trimEnd).toBe(7.464)
  })
})
