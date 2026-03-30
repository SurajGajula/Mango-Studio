import { generateId } from '@/app/lib/idUtils'
import type { AudioMark, MediaKeyframe } from '@/app/models/mediaKeyframe'

export function keyframesAfterSingleSplit(
  keyframes: MediaKeyframe[],
  splitLocal: number
): { first: MediaKeyframe[]; second: MediaKeyframe[] } {
  return {
    first: keyframes.filter((k) => k.t < splitLocal),
    second: keyframes
      .filter((k) => k.t >= splitLocal)
      .map((k) => ({ ...k, id: generateId('kf'), t: k.t - splitLocal })),
  }
}

export function keyframesForVideoSegmentBoundaries(
  keyframes: MediaKeyframe[],
  boundariesLocal: number[]
): MediaKeyframe[][] {
  const out: MediaKeyframe[][] = []
  for (let i = 0; i < boundariesLocal.length - 1; i++) {
    const a0 = boundariesLocal[i]
    const a1 = boundariesLocal[i + 1]
    const isLast = i === boundariesLocal.length - 2
    const seg = keyframes
      .filter((k) => (isLast ? k.t >= a0 && k.t <= a1 : k.t >= a0 && k.t < a1))
      .map((k) => ({ ...k, id: generateId('kf'), t: k.t - a0 }))
    out.push(seg)
  }
  return out
}

export function partitionImageKeyframesByAbsoluteBoundaries(
  imageStartTime: number,
  keyframes: MediaKeyframe[],
  boundariesAbs: number[]
): MediaKeyframe[][] {
  const out: MediaKeyframe[][] = []
  for (let i = 0; i < boundariesAbs.length - 1; i++) {
    const a0 = boundariesAbs[i]
    const a1 = boundariesAbs[i + 1]
    const isLast = i === boundariesAbs.length - 2
    const seg = keyframes
      .map((k) => ({ k, abs: imageStartTime + k.t }))
      .filter(({ abs }) => (isLast ? abs >= a0 && abs <= a1 : abs >= a0 && abs < a1))
      .map(({ k, abs }) => ({ ...k, id: generateId('kf'), t: abs - a0 }))
    out.push(seg)
  }
  return out
}

export function partitionAudioMarksAtSplit(
  marks: AudioMark[],
  splitPointInOriginal: number
): { first: AudioMark[]; second: AudioMark[] } {
  return {
    first: marks.filter((m) => m.t < splitPointInOriginal),
    second: marks
      .filter((m) => m.t >= splitPointInOriginal)
      .map((m) => ({ ...m, id: generateId('amark') })),
  }
}
