import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  captureTimeForVideoFramePosition,
  findPreviousVideoBeforePlayhead,
  lastFramePlaybackTimeForVideo,
  resolveVideoFrameCaptureTime,
  videoTimelineEndSeconds,
} from '@/app/lib/captureVideoFrame'

function video(id: string, timestamp: number, duration: number): VideoClass {
  return new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
}

describe('captureVideoFrame helpers', () => {
  it('computes timeline end and last-frame playback time', () => {
    const v = video('v1', 2, 5)
    expect(videoTimelineEndSeconds(v)).toBe(7)
    expect(lastFramePlaybackTimeForVideo(v)).toBeCloseTo(6.999, 3)
  })

  it('uses playhead when inside the video, otherwise last frame', () => {
    const v = video('v1', 0, 4)
    expect(resolveVideoFrameCaptureTime(v, 2)).toBe(2)
    expect(resolveVideoFrameCaptureTime(v, 10)).toBeCloseTo(3.999, 3)
  })

  it('resolves explicit first, last, and playhead frame positions', () => {
    const v = video('v1', 2, 5)
    expect(captureTimeForVideoFramePosition(v, 'first', 10)).toBe(2)
    expect(captureTimeForVideoFramePosition(v, 'last', 10)).toBeCloseTo(6.999, 3)
    expect(captureTimeForVideoFramePosition(v, 'playhead', 4)).toBe(4)
    expect(captureTimeForVideoFramePosition(v, 'playhead', 10)).toBeCloseTo(6.999, 3)
  })

  it('finds the latest video that ends at or before the playhead', () => {
    const videos = [video('v1', 0, 4), video('v2', 5, 3), video('v3', 10, 2)]
    expect(findPreviousVideoBeforePlayhead(videos, 0)?.id).toBeUndefined()
    expect(findPreviousVideoBeforePlayhead(videos, 4)?.id).toBe('v1')
    expect(findPreviousVideoBeforePlayhead(videos, 4.5)?.id).toBe('v1')
    expect(findPreviousVideoBeforePlayhead(videos, 8)?.id).toBe('v2')
    expect(findPreviousVideoBeforePlayhead(videos, 12)?.id).toBe('v3')
  })

  it('ignores videos without a media source or duration', () => {
    const missingUrl = new VideoClass('empty', 'empty', '', 3, 0)
    const zeroDuration = video('zero', 0, 0)
    expect(findPreviousVideoBeforePlayhead([missingUrl, zeroDuration], 5)).toBeNull()
  })
})
