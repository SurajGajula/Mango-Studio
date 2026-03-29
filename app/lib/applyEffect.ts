import type { EffectType } from '@/app/models/EffectClass'

let bwScratch: HTMLCanvasElement | null = null

function getBwScratch(w: number, h: number): HTMLCanvasElement {
  if (!bwScratch) bwScratch = document.createElement('canvas')
  if (bwScratch.width !== w || bwScratch.height !== h) {
    bwScratch.width = w
    bwScratch.height = h
  }
  return bwScratch
}

function makeLCG(seed: number) {
  let s = ((seed ^ 0xdeadbeef) >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function applyCrtDither(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  playbackTime: number
): void {
  const noiseFrame = Math.floor(playbackTime * 60)
  const rng = makeLCG(noiseFrame)

  // Use a fixed virtual coordinate system for the effect to ensure consistency
  // across all resolutions (preview vs export).
  const V_WIDTH = 480
  const scale = rw / V_WIDTH
  const vHeight = rh / scale

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  ctx.translate(rx, ry)
  ctx.scale(scale, scale)

  const grainPerLevel = 800 // Reduced density for a more subtle, consistent look
  const grainLevels = [80, 130, 180, 230] as const
  ctx.globalAlpha = 0.4 // Significantly softer grain to prevent "overpowering" at high res
  for (const level of grainLevels) {
    ctx.fillStyle = `rgb(${level},${level},${level})`
    for (let i = 0; i < grainPerLevel; i++) {
      ctx.fillRect(
        rng() * V_WIDTH,
        rng() * vHeight,
        1, 1
      )
    }
  }

  ctx.globalAlpha = 1
  const scanlineSpacing = 4
  const scanlineH = 1
  const scanlineScroll = (playbackTime * 20) % scanlineSpacing

  ctx.fillStyle = 'rgba(0,0,0,0.4)' // Softer scanlines
  for (let y = scanlineScroll - scanlineSpacing; y < vHeight; y += scanlineSpacing) {
    ctx.fillRect(0, y, V_WIDTH, scanlineH)
  }

  // Vignette
  const vignette = ctx.createRadialGradient(
    V_WIDTH / 2, vHeight / 2, Math.min(V_WIDTH, vHeight) * 0.3,
    V_WIDTH / 2, vHeight / 2, Math.max(V_WIDTH, vHeight) * 0.75
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.7)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, V_WIDTH, vHeight)

  ctx.restore()
}

function applyFlashingBlackVignette(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  playbackTime: number,
  intensity: number = 0.5
): void {
  if (rw <= 0 || rh <= 0) return

  const V_WIDTH = 480
  const scale = rw / V_WIDTH
  const vHeight = (rh / rw) * V_WIDTH

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  ctx.translate(rx, ry)
  ctx.scale(scale, scale)

  const flashSpeed = 50 // rad/s (faster flash)
  const flashCycle = (Math.sin(playbackTime * flashSpeed) + 1) / 2
  // intensity 0: no vignette (opacity 0)
  // intensity 1: full range 0.2 to 0.7
  const opacity = (0.2 + flashCycle * 0.5) * intensity

  const grad = ctx.createRadialGradient(
    V_WIDTH / 2, vHeight / 2, V_WIDTH * 0.1,
    V_WIDTH / 2, vHeight / 2, V_WIDTH * 0.5
  )
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,1)')

  ctx.globalAlpha = opacity
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, V_WIDTH, vHeight)

  ctx.restore()
}

function applyBlackAndWhite(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  intensity: number = 0.5
): void {
  if (rw <= 0 || rh <= 0) return
  const t = Math.max(0, Math.min(1, intensity))
  if (t <= 0) return

  const iw = Math.max(1, Math.round(rw))
  const ih = Math.max(1, Math.round(rh))

  const snap = getBwScratch(iw, ih)
  const sctx = snap.getContext('2d')
  if (!sctx) return

  const source = ctx.canvas
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  const c = 1 + 1.2 * t
  sctx.filter =
    t >= 1
      ? `grayscale(1) saturate(0) contrast(${c})`
      : `grayscale(${t}) contrast(${c})`
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  sctx.filter = 'none'

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()
  ctx.clearRect(rx, ry, rw, rh)
  ctx.drawImage(snap, 0, 0, iw, ih, rx, ry, rw, rh)
  ctx.restore()
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  type: EffectType,
  x: number,
  y: number,
  width: number,
  height: number,
  playbackTime: number,
  intensity: number = 0.5
): void {
  if (type === 'crt-dither') {
    applyCrtDither(ctx, x, y, width, height, playbackTime)
  } else if (type === 'flashing-black-vignette') {
    applyFlashingBlackVignette(ctx, x, y, width, height, playbackTime, intensity)
  } else if (type === 'black-and-white') {
    applyBlackAndWhite(ctx, x, y, width, height, intensity)
  }
}
