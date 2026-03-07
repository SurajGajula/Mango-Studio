import Meyda from 'meyda'
import type { AudioAnalysisResult } from '@/app/stores/audioStore'

const BUFFER_SIZE = 1024
const HOP_SIZE = 512
const WAVEFORM_POINTS = 1000
const CHORUS_SEGMENT_DURATION = 2
const MIN_CHORUS_DURATION = 10
const BASS_FREQ_MAX = 250

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[], avg: number): number {
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function detectBpmAndBeats(
  onsetStrength: number[],
  sampleRate: number
): { bpm: number; beats: number[] } {
  const hopDuration = HOP_SIZE / sampleRate
  const minLag = Math.round(60 / (180 * hopDuration))
  const maxLag = Math.round(60 / (60 * hopDuration))
  const n = onsetStrength.length

  const autocorr = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += onsetStrength[i] * onsetStrength[i + lag]
    }
    autocorr[lag] = sum
  }

  let bestLag = minLag
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (autocorr[lag] > autocorr[bestLag]) bestLag = lag
  }

  const bpm = 60 / (bestLag * hopDuration)
  const beatPeriodFrames = bestLag

  const onsetMean = mean(onsetStrength)
  const onsetStd = stdDev(onsetStrength, onsetMean)
  const threshold = onsetMean + 0.5 * onsetStd

  let firstBeat = 0
  for (let i = 0; i < Math.min(beatPeriodFrames * 2, n); i++) {
    if (onsetStrength[i] > threshold) {
      firstBeat = i
      break
    }
  }

  const beats: number[] = []
  for (let frame = firstBeat; frame < n; frame += beatPeriodFrames) {
    beats.push(frame * hopDuration)
  }

  return { bpm: Math.round(bpm * 10) / 10, beats }
}

function computeQuarterBeats(beats: number[]): number[] {
  const quarterBeats: number[] = []
  for (let i = 0; i < beats.length - 1; i++) {
    const step = (beats[i + 1] - beats[i]) / 4
    for (let q = 1; q <= 3; q++) {
      quarterBeats.push(beats[i] + step * q)
    }
  }
  return quarterBeats
}

function detectDrops(
  energyFrames: number[],
  bassEnergyFrames: number[],
  spectralFluxFrames: number[],
  beats: number[],
  sampleRate: number
): number[] {
  const hopDuration = HOP_SIZE / sampleRate
  const n = energyFrames.length
  const energyDeltas: number[] = new Array(n).fill(0)

  for (let i = 1; i < n; i++) {
    energyDeltas[i] = Math.max(0, energyFrames[i] - energyFrames[i - 1])
  }

  const deltaAvg = mean(energyDeltas)
  const deltaStd = stdDev(energyDeltas, deltaAvg)
  const fluxMedian = median(spectralFluxFrames)
  const bassMedian = median(bassEnergyFrames)

  const candidateTimes: number[] = []
  const deltaThreshold = deltaAvg + 2 * deltaStd

  for (let i = 1; i < n; i++) {
    if (
      energyDeltas[i] > deltaThreshold &&
      bassEnergyFrames[i] > bassMedian * 1.5 &&
      spectralFluxFrames[i] > fluxMedian * 1.5
    ) {
      candidateTimes.push(i * hopDuration)
    }
  }

  const drops: number[] = []
  const MERGE_THRESHOLD = 0.5

  for (const t of candidateTimes) {
    const last = drops[drops.length - 1]
    if (last === undefined || t - last > MERGE_THRESHOLD) {
      const nearestBeat = beats.reduce(
        (best, beat) => (Math.abs(beat - t) < Math.abs(best - t) ? beat : best),
        beats[0] ?? t
      )
      const snappedTime = beats.length > 0 && Math.abs(nearestBeat - t) < 0.5 ? nearestBeat : t
      if (drops[drops.length - 1] !== snappedTime) {
        drops.push(snappedTime)
      }
    }
  }

  return drops
}

function detectChoruses(
  chromaPerSegment: number[][],
  sampleRate: number,
  totalSamples: number
): { start: number; end: number }[] {
  const n = chromaPerSegment.length
  if (n < 2) return []

  const similarity: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const sim = cosineSimilarity(chromaPerSegment[i], chromaPerSegment[j])
      similarity[i][j] = sim
      similarity[j][i] = sim
    }
  }

  const minSegments = Math.ceil(MIN_CHORUS_DURATION / CHORUS_SEGMENT_DURATION)
  const threshold = 0.85
  const choruses: { start: number; end: number }[] = []

  for (let diag = 1; diag < n; diag++) {
    let runStart = -1
    let runLength = 0
    for (let i = 0; i + diag < n; i++) {
      if (similarity[i][i + diag] >= threshold) {
        if (runStart === -1) runStart = i
        runLength++
      } else {
        if (runLength >= minSegments) {
          const startTime = runStart * CHORUS_SEGMENT_DURATION
          const endTime = (runStart + runLength) * CHORUS_SEGMENT_DURATION
          choruses.push({ start: startTime, end: Math.min(endTime, totalSamples / sampleRate) })
        }
        runStart = -1
        runLength = 0
      }
    }
    if (runLength >= minSegments) {
      const startTime = runStart * CHORUS_SEGMENT_DURATION
      const endTime = (runStart + runLength) * CHORUS_SEGMENT_DURATION
      choruses.push({ start: startTime, end: Math.min(endTime, totalSamples / sampleRate) })
    }
  }

  const merged: { start: number; end: number }[] = []
  choruses.sort((a, b) => a.start - b.start)
  for (const c of choruses) {
    const last = merged[merged.length - 1]
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end)
    } else {
      merged.push({ ...c })
    }
  }

  return merged
}

function buildWaveform(samples: Float32Array, points: number): number[] {
  const chunkSize = Math.floor(samples.length / points)
  const waveform: number[] = []
  for (let i = 0; i < points; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, samples.length)
    let rms = 0
    for (let j = start; j < end; j++) rms += samples[j] * samples[j]
    waveform.push(Math.sqrt(rms / (end - start)))
  }
  return waveform
}

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  const { samples, sampleRate } = e.data

  Meyda.bufferSize = BUFFER_SIZE
  Meyda.sampleRate = sampleRate

  const hopDuration = HOP_SIZE / sampleRate
  const totalFrames = Math.floor((samples.length - BUFFER_SIZE) / HOP_SIZE) + 1

  const spectralFluxFrames: number[] = []
  const energyFrames: number[] = []
  const bassEnergyFrames: number[] = []
  const chromaPerFrame: number[][] = []

  const bassBinMax = Math.floor((BASS_FREQ_MAX / (sampleRate / 2)) * (BUFFER_SIZE / 2 + 1))

  let prevAmplitude: Float32Array | null = null

  for (let i = 0; i < totalFrames; i++) {
    const start = i * HOP_SIZE
    const frame = samples.slice(start, start + BUFFER_SIZE)

    const features = Meyda.extract(['amplitudeSpectrum', 'energy', 'chroma', 'powerSpectrum'], frame)
    if (!features) continue

    const ampSpec = features.amplitudeSpectrum as Float32Array
    const energy = (features.energy as number) ?? 0
    const chroma = (features.chroma as number[]) ?? new Array(12).fill(0)
    const powerSpec = features.powerSpectrum as Float32Array

    let flux = 0
    if (prevAmplitude) {
      for (let b = 0; b < ampSpec.length; b++) {
        const diff = ampSpec[b] - prevAmplitude[b]
        if (diff > 0) flux += diff
      }
    }
    prevAmplitude = ampSpec

    let bassEnergy = 0
    if (powerSpec) {
      for (let b = 0; b < Math.min(bassBinMax, powerSpec.length); b++) {
        bassEnergy += powerSpec[b]
      }
    }

    spectralFluxFrames.push(flux)
    energyFrames.push(energy)
    bassEnergyFrames.push(bassEnergy)
    chromaPerFrame.push(chroma)
  }

  const { bpm, beats } = detectBpmAndBeats(spectralFluxFrames, sampleRate)
  const quarterBeats = computeQuarterBeats(beats)
  const drops = detectDrops(energyFrames, bassEnergyFrames, spectralFluxFrames, beats, sampleRate)

  const segmentFrames = Math.round(CHORUS_SEGMENT_DURATION / hopDuration)
  const numSegments = Math.floor(chromaPerFrame.length / segmentFrames)
  const chromaPerSegment: number[][] = []
  for (let s = 0; s < numSegments; s++) {
    const avg = new Array(12).fill(0)
    for (let f = 0; f < segmentFrames; f++) {
      const frame = chromaPerFrame[s * segmentFrames + f]
      if (frame) for (let c = 0; c < 12; c++) avg[c] += frame[c]
    }
    for (let c = 0; c < 12; c++) avg[c] /= segmentFrames
    chromaPerSegment.push(avg)
  }

  const choruses = detectChoruses(chromaPerSegment, sampleRate, samples.length)

  const normalize = (arr: number[]): number[] => {
    const max = Math.max(...arr, 1e-10)
    return arr.map((v) => v / max)
  }

  const waveform = buildWaveform(samples, WAVEFORM_POINTS)

  const downsample = (arr: number[]): number[] => {
    if (arr.length <= WAVEFORM_POINTS) return normalize(arr)
    const step = arr.length / WAVEFORM_POINTS
    const result: number[] = []
    for (let i = 0; i < WAVEFORM_POINTS; i++) {
      result.push(arr[Math.floor(i * step)])
    }
    return normalize(result)
  }

  const result: AudioAnalysisResult = {
    bpm,
    duration: samples.length / sampleRate,
    beats,
    quarterBeats,
    drops,
    choruses,
    graphs: {
      waveform: normalize(waveform),
      spectralFlux: downsample(spectralFluxFrames),
      energy: downsample(energyFrames),
      bassEnergy: downsample(bassEnergyFrames),
    },
  }

  self.postMessage(result)
}
