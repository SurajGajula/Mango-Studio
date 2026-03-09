import type { AudioAnalysisResult } from '@/app/stores/audioStore'

export function drawAudioGraph(
  canvas: HTMLCanvasElement,
  analysis: AudioAnalysisResult,
  totalDuration: number,
  paddingDuration: number
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = width
  canvas.height = height

  const { waveform, duration } = analysis
  const n = waveform.length

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, width, height)

  const totalWithPadding = totalDuration + paddingDuration * 2
  if (totalWithPadding <= 0) return

  const startX = (paddingDuration / totalWithPadding) * width
  const endX = ((paddingDuration + duration) / totalWithPadding) * width
  const drawWidth = endX - startX
  if (drawWidth <= 0) return

  ctx.beginPath()
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  for (let i = 0; i < n; i++) {
    const x = startX + (i / (n - 1)) * drawWidth
    const y = height - waveform[i] * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}
