import { describe, it, expect } from 'vitest'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'

function clip(
  base: Partial<{ cropSx: number; cropSy: number; cropSw: number; cropSh: number; zoomIntensity: number }> = {},
  keyframes: MediaKeyframe[] = []
) {
  return {
    cropSx: base.cropSx ?? 0,
    cropSy: base.cropSy ?? 0,
    cropSw: base.cropSw ?? 1,
    cropSh: base.cropSh ?? 1,
    zoomIntensity: base.zoomIntensity ?? 0.5,
    keyframes,
  }
}

describe('resolveMediaKeyframeTransform', () => {
  it('returns base crop when there are no keyframes', () => {
    const r = resolveMediaKeyframeTransform(clip({ cropSx: 0.1, zoomIntensity: 0.7 }, []), 2, 10)
    expect(r.cropSx).toBe(0.1)
    expect(r.zoomIntensity).toBe(0.7)
  })

  it('returns base crop when there is only one keyframe', () => {
    const kf: MediaKeyframe = {
      id: 'k1',
      t: 1,
      cropSx: 0.5,
      cropSy: 0,
      cropSw: 0.5,
      cropSh: 1,
      zoomIntensity: 1,
    }
    const r = resolveMediaKeyframeTransform(clip({ cropSx: 0 }, [kf]), 5, 10)
    expect(r.cropSx).toBe(0)
    expect(r.zoomIntensity).toBe(0.5)
  })

  it('uses first keyframe values before first keyframe time', () => {
    const a: MediaKeyframe = {
      id: 'a',
      t: 2,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0,
    }
    const b: MediaKeyframe = {
      id: 'b',
      t: 8,
      cropSx: 1,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 1,
    }
    const r = resolveMediaKeyframeTransform(clip({}, [b, a]), 0.5, 10)
    expect(r.cropSx).toBe(0)
    expect(r.zoomIntensity).toBe(0)
  })

  it('uses last keyframe values after last keyframe time', () => {
    const a: MediaKeyframe = {
      id: 'a',
      t: 1,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0,
    }
    const b: MediaKeyframe = {
      id: 'b',
      t: 4,
      cropSx: 0.8,
      cropSy: 0.2,
      cropSw: 0.5,
      cropSh: 0.5,
      zoomIntensity: 0.9,
    }
    const r = resolveMediaKeyframeTransform(clip({}, [a, b]), 9, 10)
    expect(r.cropSx).toBe(0.8)
    expect(r.cropSy).toBe(0.2)
    expect(r.zoomIntensity).toBe(0.9)
  })

  it('linearly interpolates at midpoint between two keyframes', () => {
    const a: MediaKeyframe = {
      id: 'a',
      t: 0,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0,
    }
    const b: MediaKeyframe = {
      id: 'b',
      t: 10,
      cropSx: 1,
      cropSy: 0.5,
      cropSw: 0.5,
      cropSh: 0.5,
      zoomIntensity: 1,
    }
    const r = resolveMediaKeyframeTransform(clip({}, [a, b]), 5, 10)
    expect(r.cropSx).toBeCloseTo(0.5)
    expect(r.cropSy).toBeCloseTo(0.25)
    expect(r.cropSw).toBeCloseTo(0.75)
    expect(r.zoomIntensity).toBeCloseTo(0.5)
  })
})
