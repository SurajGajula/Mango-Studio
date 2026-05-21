import { describe, it, expect } from 'vitest'
import { trimmedSampleRange } from '@/app/lib/audioLoudnessNormalize'

describe('trimmedSampleRange', () => {
  it('maps trim start/end to sample indices', () => {
    const sr = 48000
    const bufferDurationSec = 10
    const bufferFrameCount = Math.floor(bufferDurationSec * sr)
    const r = trimmedSampleRange(sr, bufferFrameCount, bufferDurationSec, 1, 2, 10)
    expect(r.startFrame).toBe(Math.floor(1 * sr))
    expect(r.endFrameExclusive).toBe(Math.floor((10 - 2) * sr))
  })

  it('returns empty range when trim leaves no playable segment', () => {
    const sr = 44100
    const bufferDurationSec = 5
    const bufferFrameCount = Math.floor(bufferDurationSec * sr)
    const r = trimmedSampleRange(sr, bufferFrameCount, bufferDurationSec, 3, 3, 6)
    expect(r.startFrame).toBe(0)
    expect(r.endFrameExclusive).toBe(0)
  })
})
