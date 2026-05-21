export async function decodeAudioWaveformPeaks(url: string, barCount: number): Promise<number[]> {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`Failed to load audio (${response.status})`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const channel = audioBuffer.getChannelData(0)
    const samplesPerBar = Math.max(1, Math.floor(channel.length / barCount))
    const peaks: number[] = []
    for (let i = 0; i < barCount; i++) {
      let max = 0
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, channel.length)
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j])
        if (v > max) max = v
      }
      peaks.push(max)
    }
    return peaks
  } finally {
    await audioContext.close()
  }
}
