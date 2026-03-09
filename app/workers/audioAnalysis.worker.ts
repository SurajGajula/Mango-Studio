import type { AudioAnalysisResult } from '@/app/stores/audioStore'

const WAVEFORM_POINTS = 1000

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  const { samples, sampleRate } = e.data

  const duration = samples.length / sampleRate
  const chunkSize = Math.floor(samples.length / WAVEFORM_POINTS)
  const waveform: number[] = []

  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, samples.length)
    let rms = 0
    for (let j = start; j < end; j++) rms += samples[j] * samples[j]
    waveform.push(Math.sqrt(rms / (end - start)))
  }

  const max = Math.max(...waveform, 1e-10)
  const normalized = waveform.map((v) => v / max)

  const result: AudioAnalysisResult = { duration, waveform: normalized }
  self.postMessage(result)
}
