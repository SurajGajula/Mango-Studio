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

  // Scale grain to canvas size so density matches the preview at any resolution.
  // Reference: ~480×270 preview. grainSize keeps coverage ratio constant.
  const grainSize = Math.max(1, Math.round(rw / 480))
  const grainPerLevel = Math.round(1000 * grainSize)
  const scanlineSpacing = Math.max(4, grainSize * 4)
  const scanlineH = Math.max(1, Math.round(grainSize * 0.75))
  const scanlineScroll = Math.floor(playbackTime * 30) % scanlineSpacing

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  const grainLevels = [80, 130, 180, 230] as const
  ctx.globalAlpha = 0.8
  for (const level of grainLevels) {
    ctx.fillStyle = `rgb(${level},${level},${level})`
    for (let i = 0; i < grainPerLevel; i++) {
      ctx.fillRect(
        rx + Math.floor(rng() * (rw - grainSize)),
        ry + Math.floor(rng() * (rh - grainSize)),
        grainSize, grainSize
      )
    }
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  for (let y = ry + scanlineScroll; y < ry + rh; y += scanlineSpacing) {
    ctx.fillRect(rx, y, rw, scanlineH)
  }

  // Vignette
  const vignette = ctx.createRadialGradient(
    rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.3,
    rx + rw / 2, ry + rh / 2, Math.max(rw, rh) * 0.75
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.8)')
  ctx.fillStyle = vignette
  ctx.fillRect(rx, ry, rw, rh)

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
