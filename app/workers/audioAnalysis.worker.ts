import Meyda from 'meyda'
import type { AudioAnalysisResult, AnalysisParams } from '@/app/stores/audioStore'

const BUFFER_SIZE = 2048
const HOP_SIZE = 512
const WAVEFORM_POINTS = 1000
const BASS_FREQ_MAX = 250
const HPSS_HARMONIC_WIN = 25
const HPSS_PERCUSSIVE_WIN = 15

// Cached Essentia instance — initialized once per worker lifetime
let essentiaInitPromise: Promise<any> | null = null

function getEssentia(): Promise<any> {
  if (!essentiaInitPromise) {
    essentiaInitPromise = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pkg = await import('essentia.js' as any)
        const EssentiaWASM = pkg.EssentiaWASM ?? pkg.default?.EssentiaWASM
        const EssentiaClass = pkg.Essentia ?? pkg.default?.Essentia
        if (!EssentiaWASM || !EssentiaClass) return null
        const wasmInstance = await EssentiaWASM()
        return new EssentiaClass(wasmInstance)
      } catch {
        return null
      }
    })()
  }
  return essentiaInitPromise!
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[], avg: number): number {
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length)
}

function smoothMovingAverage(arr: number[], winSize: number): number[] {
  const half = Math.floor(winSize / 2)
  const n = arr.length
  const result = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += arr[j]; count++
    }
    result[i] = sum / count
  }
  return result
}

function normalizePercentile(arr: number[], pct = 0.95): number[] {
  const sorted = [...arr].sort((a, b) => a - b)
  const p = sorted[Math.max(0, Math.floor(sorted.length * pct) - 1)] + 1e-10
  return arr.map((v) => Math.min(v / p, 1.0))
}

function percentile(arr: number[], pct: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.floor(sorted.length * pct) - 1)]
}

function localWindowThreshold(frames: number[], i: number, localWin: number): { lMean: number; lStd: number } {
  const n = frames.length
  const lo = Math.max(0, i - localWin)
  const hi = Math.min(n, i + localWin + 1)
  let lSum = 0, lSumSq = 0
  for (let j = lo; j < hi; j++) { lSum += frames[j]; lSumSq += frames[j] * frames[j] }
  const count = hi - lo
  const lMean = lSum / count
  const lStd = Math.sqrt(Math.max(0, lSumSq / count - lMean * lMean))
  return { lMean, lStd }
}

function computeQuarterBeats(beats: number[]): number[] {
  const quarterBeats: number[] = []
  for (let i = 0; i < beats.length - 1; i++) {
    const step = (beats[i + 1] - beats[i]) / 4
    for (let q = 1; q <= 3; q++) quarterBeats.push(beats[i] + step * q)
  }
  return quarterBeats
}

function detectDrops(
  energyFrames: number[], bassEnergyFrames: number[], spectralFluxFrames: number[],
  beats: number[], sampleRate: number
): number[] {
  const hopDuration = HOP_SIZE / sampleRate
  const n = energyFrames.length
  const energyDeltas: number[] = new Array(n).fill(0)
  for (let i = 1; i < n; i++) energyDeltas[i] = Math.max(0, energyFrames[i] - energyFrames[i - 1])
  const deltaAvg = mean(energyDeltas)
  const deltaStd = stdDev(energyDeltas, deltaAvg)
  const bassMedian = percentile(bassEnergyFrames, 0.5)
  const fluxMedian = percentile(spectralFluxFrames, 0.5)
  const deltaThreshold = deltaAvg + 2 * deltaStd
  const drops: number[] = []
  for (let i = 1; i < n; i++) {
    if (energyDeltas[i] > deltaThreshold && bassEnergyFrames[i] > bassMedian * 1.5 && spectralFluxFrames[i] > fluxMedian * 1.5) {
      const t = i * hopDuration
      const last = drops[drops.length - 1]
      if (last === undefined || t - last > 0.5) {
        const nearestBeat = beats.reduce((best, beat) => Math.abs(beat - t) < Math.abs(best - t) ? beat : best, beats[0] ?? t)
        const snapped = beats.length > 0 && Math.abs(nearestBeat - t) < 0.5 ? nearestBeat : t
        if (drops[drops.length - 1] !== snapped) drops.push(snapped)
      }
    }
  }
  return drops
}

function detectDrumOnsets(percFlux: number[], sampleRate: number): number[] {
  const hopDuration = HOP_SIZE / sampleRate
  const n = percFlux.length
  const minGap = Math.floor(0.08 / hopDuration)
  const localWin = Math.floor(0.75 / hopDuration)
  const peaks: number[] = []
  let lastPeakFrame = -minGap
  for (let i = 2; i < n - 2; i++) {
    if (i - lastPeakFrame < minGap) continue
    if (percFlux[i] <= percFlux[i - 1] || percFlux[i] <= percFlux[i + 1]) continue
    const { lMean, lStd } = localWindowThreshold(percFlux, i, localWin)
    if (percFlux[i] >= lMean + lStd * 0.7) {
      peaks.push(Math.round(i * hopDuration * 1000) / 1000)
      lastPeakFrame = i
    }
  }
  return peaks
}

function detectBassOnsets(bassEnergyFrames: number[], sampleRate: number): number[] {
  const hopDuration = HOP_SIZE / sampleRate
  const n = bassEnergyFrames.length
  const bassFlux: number[] = [0]
  for (let i = 1; i < n; i++) bassFlux.push(Math.max(0, bassEnergyFrames[i] - bassEnergyFrames[i - 1]))
  const smoothed = smoothMovingAverage(bassFlux, 6)
  const minGap = Math.floor(0.15 / hopDuration)
  const localWin = Math.floor(1.0 / hopDuration)
  const peaks: number[] = []
  let lastPeakFrame = -minGap
  for (let i = 2; i < n - 2; i++) {
    if (i - lastPeakFrame < minGap) continue
    if (smoothed[i] <= smoothed[i - 1] || smoothed[i] <= smoothed[i + 1]) continue
    const { lMean, lStd } = localWindowThreshold(smoothed, i, localWin)
    if (smoothed[i] >= lMean + lStd * 0.5) {
      peaks.push(Math.round(i * hopDuration * 1000) / 1000)
      lastPeakFrame = i
    }
  }
  return peaks
}

// Melody: fuses guitar-band, piano-band, and vocal-band harmonic flux into one signal.
// Gated against purely percussive frames so pure hits don't pollute.
function detectMelodyOnsets(
  guitarFlux: number[], pianoFlux: number[], vocalFlux: number[],
  percussiveFlux: number[], sampleRate: number,
  smoothWin: number, floorPct: number, stdMult: number, minGapSec: number, percGateMult: number
): number[] {
  const hopDuration = HOP_SIZE / sampleRate
  const normGuitar = normalizePercentile(smoothMovingAverage(guitarFlux, smoothWin), 0.95)
  const normPiano  = normalizePercentile(smoothMovingAverage(pianoFlux,  smoothWin), 0.95)
  const normVocal  = normalizePercentile(smoothMovingAverage(vocalFlux,  smoothWin * 2), 0.95)
  const fused = normGuitar.map((v, i) => Math.max(v, normPiano[i] * 0.85, normVocal[i] * 0.7))
  const n = fused.length
  if (n < 3) return []
  const minGap = Math.floor(minGapSec / hopDuration)
  const localWin = Math.floor(1.5 / hopDuration)
  const percHigh = percentile(percussiveFlux, 0.80)
  const globalFloor = percentile(fused, floorPct)
  const peaks: number[] = []
  let lastPeakFrame = -minGap
  for (let i = 2; i < n - 2; i++) {
    if (i - lastPeakFrame < minGap) continue
    if (fused[i] <= globalFloor) continue
    if (fused[i] <= fused[i - 1] || fused[i] <= fused[i + 1]) continue
    if (percussiveFlux[i] > percHigh * percGateMult) continue
    const { lMean, lStd } = localWindowThreshold(fused, i, localWin)
    if (fused[i] >= lMean + lStd * stdMult) {
      peaks.push(Math.round(i * hopDuration * 1000) / 1000)
      lastPeakFrame = i
    }
  }
  return peaks
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

function applyHPSS(
  spectrogramFrames: Float32Array[],
  sampleRate: number,
  guitarBinMin: number, guitarBinMax: number,
  pianoBinMin: number, pianoBinMax: number,
  vocalBinMin: number, vocalBinMax: number
): {
  harmonicFlux: number[]
  percussiveFlux: number[]
  pianoBandFlux: number[]
  harmonicGuitarFlux: number[]
  harmonicVocalFlux: number[]
} {
  const nFrames = spectrogramFrames.length
  const nBins = spectrogramFrames[0]?.length ?? 0
  if (nFrames === 0 || nBins === 0) {
    return { harmonicFlux: [], percussiveFlux: [], pianoBandFlux: [], harmonicGuitarFlux: [], harmonicVocalFlux: [] }
  }
  const halfH = Math.floor(HPSS_HARMONIC_WIN / 2)
  const halfP = Math.floor(HPSS_PERCUSSIVE_WIN / 2)
  const harmonicFlux: number[] = []
  const percussiveFlux: number[] = []
  const pianoBandFlux: number[] = []
  const harmonicGuitarFlux: number[] = []
  const harmonicVocalFlux: number[] = []
  let prevMaskedH: number[] | null = null
  let prevMaskedP: number[] | null = null

  for (let t = 0; t < nFrames; t++) {
    const maskedH = new Array<number>(nBins)
    const maskedP = new Array<number>(nBins)
    for (let b = 0; b < nBins; b++) {
      let sumH = 0, countH = 0
      for (let dt = -halfH; dt <= halfH; dt++) {
        const tt = t + dt
        if (tt >= 0 && tt < nFrames) { sumH += spectrogramFrames[tt][b]; countH++ }
      }
      let sumP = 0, countP = 0
      for (let db = -halfP; db <= halfP; db++) {
        const bb = b + db
        if (bb >= 0 && bb < nBins) { sumP += spectrogramFrames[t][bb]; countP++ }
      }
      const denom = sumH / countH + sumP / countP + 1e-10
      const orig = spectrogramFrames[t][b]
      maskedH[b] = orig * ((sumH / countH) / denom)
      maskedP[b] = orig * ((sumP / countP) / denom)
    }

    let hFlux = 0, pFlux = 0, pianoVal = 0, guitarVal = 0, vocalVal = 0
    if (prevMaskedH !== null && prevMaskedP !== null) {
      for (let b = 0; b < nBins; b++) {
        const dh = maskedH[b] - prevMaskedH[b]
        const dp = maskedP[b] - prevMaskedP[b]
        if (dh > 0) {
          hFlux += dh
          if (b >= pianoBinMin  && b < pianoBinMax)  pianoVal  += dh
          if (b >= guitarBinMin && b < guitarBinMax) guitarVal += dh
          if (b >= vocalBinMin  && b < vocalBinMax)  vocalVal  += dh
        }
        if (dp > 0) pFlux += dp
      }
    }
    harmonicFlux.push(hFlux)
    percussiveFlux.push(pFlux)
    pianoBandFlux.push(pianoVal)
    harmonicGuitarFlux.push(guitarVal)
    harmonicVocalFlux.push(vocalVal)
    prevMaskedH = maskedH
    prevMaskedP = maskedP
  }
  return { harmonicFlux, percussiveFlux, pianoBandFlux, harmonicGuitarFlux, harmonicVocalFlux }
}

// Fallback autocorrelation beat detection when Essentia is unavailable
function detectBpmAndBeatsFallback(onsetStrength: number[], sampleRate: number): { bpm: number; beats: number[] } {
  const hopDuration = HOP_SIZE / sampleRate
  const minLag = Math.round(60 / (180 * hopDuration))
  const maxLag = Math.round(60 / (60 * hopDuration))
  const n = onsetStrength.length
  const autocorr = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += onsetStrength[i] * onsetStrength[i + lag]
    autocorr[lag] = sum
  }
  let bestLag = minLag
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (autocorr[lag] > autocorr[bestLag]) bestLag = lag
  }
  const bpm = 60 / (bestLag * hopDuration)
  const beatPeriodFrames = bestLag
  const avg = mean(onsetStrength)
  const std = stdDev(onsetStrength, avg)
  const threshold = avg + 0.5 * std
  let firstBeat = 0
  for (let i = 0; i < Math.min(beatPeriodFrames * 2, n); i++) {
    if (onsetStrength[i] > threshold) { firstBeat = i; break }
  }
  const beats: number[] = []
  for (let frame = firstBeat; frame < n; frame += beatPeriodFrames) beats.push(frame * hopDuration)
  return { bpm: Math.round(bpm * 10) / 10, beats }
}

self.onmessage = async (e: MessageEvent<{ samples: Float32Array; sampleRate: number; params?: Partial<AnalysisParams> }>) => {
  const { samples, sampleRate, params = {} } = e.data
  const p = {
    melodyFreqMin:  params.melodyFreqMin  ?? 200,
    melodyFreqMax:  params.melodyFreqMax  ?? 4000,
    melodyFloorPct: params.melodyFloorPct ?? 0.35,
    melodyStdMult:  params.melodyStdMult  ?? 0.3,
    melodyMinGap:   params.melodyMinGap   ?? 0.15,
    melodyPercGate: params.melodyPercGate ?? 3.0,
    smoothWin:      params.smoothWin      ?? 6,
  }

  Meyda.bufferSize = BUFFER_SIZE
  Meyda.sampleRate = sampleRate

  const nyq = sampleRate / 2
  const toBin = (hz: number) => Math.floor((hz / nyq) * (BUFFER_SIZE / 2 + 1))
  const bassBinMax    = toBin(BASS_FREQ_MAX)
  const guitarBinMin  = toBin(500)
  const guitarBinMax  = toBin(2500)
  const pianoBinMin   = toBin(p.melodyFreqMin)
  const pianoBinMax   = toBin(p.melodyFreqMax)
  const vocalBinMin   = toBin(150)
  const vocalBinMax   = toBin(1000)

  const hopDuration = HOP_SIZE / sampleRate
  const totalFrames = Math.floor((samples.length - BUFFER_SIZE) / HOP_SIZE) + 1

  const spectrogramFrames: Float32Array[] = []
  const spectralFluxFrames: number[] = []
  const energyFrames: number[] = []
  const bassEnergyFrames: number[] = []
  let prevAmplitude: Float32Array | null = null

  for (let i = 0; i < totalFrames; i++) {
    const frame = samples.slice(i * HOP_SIZE, i * HOP_SIZE + BUFFER_SIZE)
    const features = Meyda.extract(['amplitudeSpectrum', 'energy', 'powerSpectrum'], frame)
    if (!features) continue
    const ampSpec = features.amplitudeSpectrum as Float32Array
    const energy = (features.energy as number) ?? 0
    const powerSpec = features.powerSpectrum as Float32Array
    spectrogramFrames.push(ampSpec)
    energyFrames.push(energy)
    let flux = 0
    if (prevAmplitude) {
      for (let b = 0; b < ampSpec.length; b++) {
        const diff = ampSpec[b] - prevAmplitude[b]
        if (diff > 0) flux += diff
      }
    }
    prevAmplitude = ampSpec
    spectralFluxFrames.push(flux)
    let bassEnergy = 0
    if (powerSpec) for (let b = 0; b < Math.min(bassBinMax, powerSpec.length); b++) bassEnergy += powerSpec[b]
    bassEnergyFrames.push(bassEnergy)
  }

  const { harmonicFlux, percussiveFlux, pianoBandFlux, harmonicGuitarFlux, harmonicVocalFlux } =
    applyHPSS(spectrogramFrames, sampleRate, guitarBinMin, guitarBinMax, pianoBinMin, pianoBinMax, vocalBinMin, vocalBinMax)

  const smoothPercFlux = smoothMovingAverage(percussiveFlux, p.smoothWin)

  // --- Beat tracking: try Essentia first, fall back to autocorrelation ---
  let bpm: number
  let beats: number[]

  try {
    const essentia = await getEssentia()
    if (essentia) {
      const monoVector = essentia.arrayToVector(samples)
      const beatResult = essentia.BeatTrackerMultiFeature(monoVector)
      beats = Array.from(essentia.vectorToArray(beatResult.ticks) as Float32Array)
      monoVector.delete()
      beatResult.ticks.delete()
      bpm = beats.length > 1
        ? Math.round((60 / ((beats[beats.length - 1] - beats[0]) / (beats.length - 1))) * 10) / 10
        : 0
    } else {
      const fallback = detectBpmAndBeatsFallback(spectralFluxFrames, sampleRate)
      bpm = fallback.bpm
      beats = fallback.beats
    }
  } catch {
    const fallback = detectBpmAndBeatsFallback(spectralFluxFrames, sampleRate)
    bpm = fallback.bpm
    beats = fallback.beats
  }

  const quarterBeats = computeQuarterBeats(beats)
  const drops = detectDrops(energyFrames, bassEnergyFrames, spectralFluxFrames, beats, sampleRate)

  // Drums: use Essentia beats as drum markers (accurate rhythmic hits)
  // If Essentia succeeded, beats IS the drum hit grid; otherwise fall back to percussive onset detection
  const drumMarkers = beats.length > 0 ? beats : detectDrumOnsets(smoothPercFlux, sampleRate)
  const bassMarkers = detectBassOnsets(bassEnergyFrames, sampleRate)
  const melodyMarkers = detectMelodyOnsets(
    harmonicGuitarFlux, pianoBandFlux, harmonicVocalFlux,
    smoothPercFlux, sampleRate,
    p.smoothWin, p.melodyFloorPct, p.melodyStdMult, p.melodyMinGap, p.melodyPercGate
  )

  const normalizeMax = (arr: number[]): number[] => {
    const max = Math.max(...arr, 1e-10); return arr.map((v) => v / max)
  }
  const downsample = (arr: number[]): number[] => {
    if (arr.length <= WAVEFORM_POINTS) return normalizeMax(arr)
    const step = arr.length / WAVEFORM_POINTS
    const result: number[] = []
    for (let i = 0; i < WAVEFORM_POINTS; i++) result.push(arr[Math.floor(i * step)])
    return normalizeMax(result)
  }

  // Melody graph: show the fused normalized harmonic signal
  const normGuitar = normalizePercentile(smoothMovingAverage(harmonicGuitarFlux, p.smoothWin), 0.95)
  const normPiano  = normalizePercentile(smoothMovingAverage(pianoBandFlux, p.smoothWin), 0.95)
  const normVocal  = normalizePercentile(smoothMovingAverage(harmonicVocalFlux, p.smoothWin * 2), 0.95)
  const melodySignal = normGuitar.map((v, i) => Math.max(v, normPiano[i] * 0.85, normVocal[i] * 0.7))

  const result: AudioAnalysisResult = {
    bpm,
    duration: samples.length / sampleRate,
    beats,
    quarterBeats,
    drops,
    choruses: [],
    graphPeaks: {
      drums: drumMarkers,
      bass: bassMarkers,
      melody: melodyMarkers,
    },
    graphs: {
      drums: downsample(smoothPercFlux),
      bass: downsample(bassEnergyFrames),
      melody: downsample(melodySignal),
    },
  }

  self.postMessage(result)
}
