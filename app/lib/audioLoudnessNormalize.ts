export const AUDIO_VOLUME_SLIDER_MAX = 4

export function trimmedSampleRange(
  sampleRate: number,
  bufferFrameCount: number,
  bufferDurationSec: number,
  trimStartSec: number,
  trimEndSec: number,
  originalDurationSec: number
): { startFrame: number; endFrameExclusive: number } {
  const declared = originalDurationSec > 0 ? originalDurationSec : bufferDurationSec
  const fileDurSec = Math.min(bufferDurationSec, declared)
  const ts = Math.max(0, trimStartSec)
  const te = Math.max(0, trimEndSec)
  const activeSec = Math.max(0, fileDurSec - ts - te)
  const startFrame = Math.min(bufferFrameCount, Math.max(0, Math.floor(ts * sampleRate)))
  const endFrameExclusive = Math.min(bufferFrameCount, Math.max(0, Math.floor((fileDurSec - te) * sampleRate)))
  if (activeSec <= 0 || endFrameExclusive <= startFrame) {
    return { startFrame: 0, endFrameExclusive: 0 }
  }
  return { startFrame, endFrameExclusive }
}

export function rmsFromAudioBufferTrimmed(
  buffer: AudioBuffer,
  trimStartSec: number,
  trimEndSec: number,
  originalDurationSec: number
): number {
  const { sampleRate, length, numberOfChannels } = buffer
  const { startFrame, endFrameExclusive } = trimmedSampleRange(
    sampleRate,
    length,
    buffer.duration,
    trimStartSec,
    trimEndSec,
    originalDurationSec
  )
  const span = endFrameExclusive - startFrame
  if (span <= 0) return 0

  let sumSq = 0
  let count = 0
  for (let c = 0; c < numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = startFrame; i < endFrameExclusive; i++) {
      const v = data[i]
      sumSq += v * v
      count++
    }
  }
  return Math.sqrt(sumSq / count)
}

export async function decodeAudioFromUrl(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch audio (${res.status})`)
  }
  const arr = await res.arrayBuffer()
  return ctx.decodeAudioData(arr.slice(0))
}
