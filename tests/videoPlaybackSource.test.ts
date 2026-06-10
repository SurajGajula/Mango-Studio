import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  isExtractedVideoSegment,
  normalizeVideoAfterSnapshotRevive,
  shouldPlayExtractedVideoFromSource,
  videoPlaybackMediaUrl,
  videoEffectiveSourceSpanSeconds,
  videoPlaybackOriginalDuration,
  videoPlaybackTrimEnd,
  videoSourceSpanSeconds,
  videoSourceTrimBase,
} from '@/app/lib/videoPlaybackSource'

describe('videoPlaybackSource', () => {
  it('plays extracted blob from time zero', () => {
    const v = new VideoClass('v1', 't', 'blob:seg', 5, 0, undefined, undefined, 10, 0, 0)
    v.sourceUrl = 'https://cdn.example/full.mp4'
    v.sourceTrimStart = 120
    v.sourceDuration = 600
    expect(isExtractedVideoSegment(v)).toBe(true)
    expect(shouldPlayExtractedVideoFromSource(v)).toBe(false)
    expect(videoPlaybackMediaUrl(v)).toBe('blob:seg')
    expect(videoSourceTrimBase(v)).toBe(0)
    expect(videoPlaybackTrimEnd(v)).toBe(0)
    expect(videoPlaybackOriginalDuration(v)).toBe(10)
    expect(videoSourceSpanSeconds(v)).toBe(10)
  })

  it('ignores spurious trimEnd on extracted blob segments', () => {
    const v = new VideoClass('v1', 't', 'blob:seg', 5, 0, undefined, undefined, 10, 0, 5)
    v.sourceUrl = 'https://cdn.example/full.mp4'
    v.sourceTrimStart = 30
    v.sourceDuration = 120
    expect(videoPlaybackTrimEnd(v)).toBe(0)
    expect(videoSourceSpanSeconds(v)).toBe(10)
  })

  it('falls back to source url and trim when blob is unavailable', () => {
    const v = new VideoClass('v1', 't', 'blob:seg', 5, 0, undefined, undefined, 10, 0, 0)
    v.sourceUrl = 'https://cdn.example/full.mp4'
    v.sourceTrimStart = 120
    v.sourceDuration = 600
    v.url = 'https://cdn.example/full.mp4'
    expect(shouldPlayExtractedVideoFromSource(v)).toBe(true)
    expect(videoPlaybackMediaUrl(v)).toBe('https://cdn.example/full.mp4')
    expect(videoSourceTrimBase(v)).toBe(120)
    expect(videoPlaybackOriginalDuration(v)).toBe(600)
    expect(videoSourceSpanSeconds(v)).toBe(10)
  })

  it('prefers trimStart over sourceTrimStart when both are set on full url', () => {
    const v = new VideoClass('v1', 't', 'https://cdn.example/full.mp4', 4, 0, undefined, undefined, 10, 3, 3)
    v.sourceUrl = 'https://cdn.example/full.mp4'
    v.sourceTrimStart = 1
    expect(shouldPlayExtractedVideoFromSource(v)).toBe(false)
    expect(videoSourceTrimBase(v)).toBe(3)
    expect(videoSourceSpanSeconds(v)).toBe(4)
    expect(videoPlaybackMediaUrl(v)).toBe('https://cdn.example/full.mp4')
  })

  it('normalizes lost blob segments into trim fields on hydrate', () => {
    const v = new VideoClass('v1', 't', '', 5, 0, undefined, undefined, 10, 0, 0)
    v.sourceUrl = 'https://cdn.example/full.mp4'
    v.sourceTrimStart = 30
    v.sourceDuration = 120
    const normalized = normalizeVideoAfterSnapshotRevive(v)
    expect(normalized.url).toBe('https://cdn.example/full.mp4')
    expect(normalized.trimStart).toBe(30)
    expect(normalized.trimEnd).toBe(80)
    expect(normalized.originalDuration).toBe(120)
    expect(normalized.sourceUrl).toBeUndefined()
    expect(normalized.sourceTrimStart).toBeUndefined()
    expect(shouldPlayExtractedVideoFromSource(normalized)).toBe(false)
    expect(videoSourceTrimBase(normalized)).toBe(30)
    expect(videoSourceSpanSeconds(normalized)).toBe(10)
  })

  it('uses element duration when model span is too short', () => {
    const v = new VideoClass('v1', 't', 'https://cdn.example/full.mp4', 300, 0, undefined, undefined, 120, 0, 0)
    const el = { duration: 300 } as HTMLVideoElement
    expect(videoSourceSpanSeconds(v)).toBe(120)
    expect(videoEffectiveSourceSpanSeconds(v, el)).toBe(300)
  })

  it('uses trimStart for in-out on full url', () => {
    const v = new VideoClass('v1', 't', 'https://cdn.example/full.mp4', 4, 0, undefined, undefined, 10, 3, 3)
    expect(videoSourceTrimBase(v)).toBe(3)
    expect(videoSourceSpanSeconds(v)).toBe(4)
    expect(videoPlaybackMediaUrl(v)).toBe('https://cdn.example/full.mp4')
  })
})
