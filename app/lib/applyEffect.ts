import type { EffectType } from '@/app/models/EffectClass'

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

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  type: EffectType,
  x: number,
  y: number,
  width: number,
  height: number,
  playbackTime: number
): void {
  if (type === 'crt-dither') {
    applyCrtDither(ctx, x, y, width, height, playbackTime)
  }
}
