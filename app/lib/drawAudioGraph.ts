import type { AudioAnalysisResult } from '@/app/stores/audioStore'

export function drawAudioGraph(
  canvas: HTMLCanvasElement,
  analysis: AudioAnalysisResult,
  totalDuration: number,
  paddingDuration: number,
  trimStart = 0,
  trimEnd = 0,
  audioStartTime = 0
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
  if (totalWithPadding <= 0 || n < 2) return

  const originalDuration = duration
  const activeDuration = originalDuration - trimStart - trimEnd
  if (activeDuration <= 0) return

  const pxPerSec = width / totalWithPadding
  const activeStartX = (paddingDuration + audioStartTime) * pxPerSec
  const activeEndX = activeStartX + activeDuration * pxPerSec
  const videoEndX = (paddingDuration + totalDuration) * pxPerSec
  const visibleEndX = Math.min(activeEndX, videoEndX)

  if (visibleEndX <= activeStartX) return

  const sampleStart = Math.round((trimStart / originalDuration) * (n - 1))
  const sampleEnd = Math.round(((originalDuration - trimEnd) / originalDuration) * (n - 1))
  const activeSpan = sampleEnd - sampleStart

  ctx.save()
  ctx.beginPath()
  ctx.rect(activeStartX, 0, visibleEndX - activeStartX, height)
  ctx.clip()

  ctx.beginPath()
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  for (let i = sampleStart; i <= sampleEnd; i++) {
    const progress = activeSpan > 0 ? (i - sampleStart) / activeSpan : 0
    const x = activeStartX + progress * (activeEndX - activeStartX)
    const y = height - waveform[i] * height
    if (i === sampleStart) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}
