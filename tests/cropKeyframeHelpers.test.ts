import { describe, it, expect } from 'vitest'
import {
  getEffectiveCropForEdit,
  patchCropForItemOrKeyframe,
} from '@/app/lib/cropKeyframeHelpers'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import type { VideoClass } from '@/app/models/VideoClass'
import type { ImageClass } from '@/app/models/ImageClass'

function mkKf(id: string, t: number, cropSx: number): MediaKeyframe {
  return {
    id,
    t,
    cropSx,
    cropSy: 0,
    cropSw: 0.5,
    cropSh: 1,
    zoomIntensity: 0.5,
  }
}

describe('getEffectiveCropForEdit', () => {
  it('matches resolveMediaKeyframeTransform for video when no keyframe is selected', () => {
    const item = {
      timestamp: 10,
      duration: 20,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0.5,
      keyframes: [mkKf('a', 0, 0.1), mkKf('b', 10, 0.9)],
    } as unknown as VideoClass
    const playbackTime = 25
    const localT = playbackTime - 10
    const eff = getEffectiveCropForEdit(item, null, playbackTime)
    const r = resolveMediaKeyframeTransform(item, localT, 20)
    expect(eff).toEqual({
      cropSx: r.cropSx,
      cropSy: r.cropSy,
      cropSw: r.cropSw,
      cropSh: r.cropSh,
    })
  })

  it('uses base crop when there are no keyframes', () => {
    const item = {
      timestamp: 0,
      duration: 10,
      cropSx: 0.2,
      cropSy: 0.3,
      cropSw: 0.8,
      cropSh: 0.9,
      zoomIntensity: 0.5,
      keyframes: [],
    } as unknown as VideoClass
    expect(getEffectiveCropForEdit(item, null, 5)).toEqual({
      cropSx: 0.2,
      cropSy: 0.3,
      cropSw: 0.8,
      cropSh: 0.9,
    })
  })

  it('uses selected keyframe over playback resolve', () => {
    const k = mkKf('sel', 5, 0.33)
    const item = {
      timestamp: 0,
      duration: 20,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0.5,
      keyframes: [k, mkKf('o', 10, 0.66)],
    } as unknown as VideoClass
    const eff = getEffectiveCropForEdit(item, 'sel', 12)
    expect(eff.cropSx).toBe(0.33)
  })

  it('matches resolve for image clip local time', () => {
    const item = {
      startTime: 100,
      duration: 30,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0.5,
      keyframes: [mkKf('x', 0, 0), mkKf('y', 30, 1)],
    } as unknown as ImageClass
    const playbackTime = 115
    const eff = getEffectiveCropForEdit(item, null, playbackTime)
    const r = resolveMediaKeyframeTransform(item, 15, 30)
    expect(eff.cropSx).toBe(r.cropSx)
  })
})

describe('patchCropForItemOrKeyframe', () => {
  it('updates existing keyframe near playhead when none selected', () => {
    const k = mkKf('k1', 2.01, 0.1)
    const item = {
      timestamp: 0,
      duration: 10,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0.5,
      keyframes: [k],
    } as unknown as VideoClass
    const patch = patchCropForItemOrKeyframe(item, null, { cropSx: 0.44 }, 2)
    expect(patch.keyframes).toHaveLength(1)
    expect(patch.keyframes![0].id).toBe('k1')
    expect(patch.keyframes![0].cropSx).toBe(0.44)
  })

  it('inserts keyframe at playhead when none selected and no nearby keyframe', () => {
    const item = {
      timestamp: 0,
      duration: 10,
      cropSx: 0,
      cropSy: 0,
      cropSw: 1,
      cropSh: 1,
      zoomIntensity: 0.5,
      keyframes: [mkKf('k0', 0, 0)],
    } as unknown as VideoClass
    const patch = patchCropForItemOrKeyframe(item, null, { cropSx: 0.25 }, 5)
    expect(patch.keyframes!.length).toBe(2)
    const at5 = patch.keyframes!.find((x) => Math.abs(x.t - 5) < 0.01)
    expect(at5?.cropSx).toBe(0.25)
  })
})
