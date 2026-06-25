import { trimmedSampleRange } from '@/app/lib/audioLoudnessNormalize'

const MIN_PITCH_HZ = 75
const MAX_PITCH_HZ = 400
const FRAME_SAMPLES = 2048
const HOP_SAMPLES = 1024
const RMS_GATE = 0.012

export const SPEECH_PITCH_MIN = 0.5
export const SPEECH_PITCH_MAX = 1.5

function monoSamples(buffer: AudioBuffer, startFrame: number, endFrameExclusive: number): Float32Array {
  const span = endFrameExclusive - startFrame
  const mono = new Float32Array(span)
  const channelCount = buffer.numberOfChannels
  for (let c = 0; c < channelCount; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < span; i++) {
      mono[i] += data[startFrame + i] / channelCount
    }
  }
  return mono
}

function frameRms(samples: Float32Array): number {
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i]
  }
  return Math.sqrt(sumSq / samples.length)
}

function pitchHzFromFrame(samples: Float32Array, sampleRate: number): number | null {
  if (frameRms(samples) < RMS_GATE) return null

  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ)
  const maxLag = Math.ceil(sampleRate / MIN_PITCH_HZ)
  let bestLag = -1
  let bestCorr = -1

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < samples.length - lag; i++) {
      corr += samples[i] * samples[i + lag]
    }
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  if (bestLag <= 0 || bestCorr <= 0) return null
  return sampleRate / bestLag
}

export function medianPitchHzFromBuffer(
  buffer: AudioBuffer,
  trimStartSec = 0,
  trimEndSec = 0,
  originalDurationSec?: number
): number | null {
  const declared = originalDurationSec ?? buffer.duration
  const { startFrame, endFrameExclusive } = trimmedSampleRange(
    buffer.sampleRate,
    buffer.length,
    buffer.duration,
    trimStartSec,
    trimEndSec,
    declared
  )
  const span = endFrameExclusive - startFrame
  if (span < FRAME_SAMPLES) return null

  const estimates: number[] = []
  for (let frameStart = startFrame; frameStart + FRAME_SAMPLES <= endFrameExclusive; frameStart += HOP_SAMPLES) {
    const frame = monoSamples(buffer, frameStart, frameStart + FRAME_SAMPLES)
    const hz = pitchHzFromFrame(frame, buffer.sampleRate)
    if (hz !== null) estimates.push(hz)
  }

  if (estimates.length === 0) return null
  estimates.sort((a, b) => a - b)
  return estimates[Math.floor(estimates.length / 2)]
}

export function pitchShiftToMatchReference(
  referenceHz: number,
  generatedHz: number,
  referenceTimelinePitch: number
): number {
  const target = (referenceHz * referenceTimelinePitch) / generatedHz
  return Math.max(SPEECH_PITCH_MIN, Math.min(SPEECH_PITCH_MAX, target))
}
