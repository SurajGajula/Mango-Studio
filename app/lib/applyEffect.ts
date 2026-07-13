import type { EffectType } from '@/app/models/EffectClass'

let bwScratch: HTMLCanvasElement | null = null
let contrastScratch: HTMLCanvasElement | null = null
let vividScratch: HTMLCanvasElement | null = null
let glitchScratch: HTMLCanvasElement | null = null
let grainScratch: HTMLCanvasElement | null = null
let blurVignetteScratch: HTMLCanvasElement | null = null
let coolToneScratch: HTMLCanvasElement | null = null

const VIVID_FILTER = 'saturate(1.38) contrast(1.06)'
const UNSHARP_STRENGTH = 1.85

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n
}

function getVividScratch(w: number, h: number): HTMLCanvasElement {
  if (!vividScratch) {
    vividScratch = document.createElement('canvas')
    vividScratch.getContext('2d', { willReadFrequently: true })
  }
  if (vividScratch.width !== w || vividScratch.height !== h) {
    vividScratch.width = w
    vividScratch.height = h
  }
  return vividScratch
}

function boxBlurSeparable(src: ImageData, radius: number): ImageData {
  const { width, height, data } = src
  const w = width * 4
  const size = radius * 2 + 1
  const inv = 1 / size
  const horiz = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    const row = y * w
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const i = row + xx * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        a += data[i + 3]
      }
      const o = row + x * 4
      horiz[o] = r * inv
      horiz[o + 1] = g * inv
      horiz[o + 2] = b * inv
      horiz[o + 3] = a * inv
    }
  }
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const i = yy * w + x * 4
        r += horiz[i]
        g += horiz[i + 1]
        b += horiz[i + 2]
        a += horiz[i + 3]
      }
      const o = y * w + x * 4
      out[o] = r * inv
      out[o + 1] = g * inv
      out[o + 2] = b * inv
      out[o + 3] = a * inv
    }
  }
  return new ImageData(out, width, height)
}

function applyVividSharp(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  intensity: number = 0.5
): void {
  if (rw <= 0 || rh <= 0) return
  const t = Math.max(0, Math.min(1, intensity))
  const iw = Math.max(1, Math.round(rw))
  const ih = Math.max(1, Math.round(rh))
  const source = ctx.canvas
  const snap = getVividScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.filter = VIVID_FILTER
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  sctx.filter = 'none'

  const drawSaturatedIntoClip = () => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.drawImage(snap, 0, 0, iw, ih, rx, ry, rw, rh)
    ctx.restore()
  }

  if (t <= 0) {
    drawSaturatedIntoClip()
    return
  }

  try {
    const blurRadius = Math.max(1, Math.min(2, Math.round(Math.min(iw, ih) / 480)))
    const origData = sctx.getImageData(0, 0, iw, ih)
    const blurred = boxBlurSeparable(origData, blurRadius)
    const strength = t * UNSHARP_STRENGTH
    const o = origData.data
    const b = blurred.data
    for (let i = 0; i < o.length; i += 4) {
      o[i] = clampByte(o[i] + strength * (o[i] - b[i]))
      o[i + 1] = clampByte(o[i + 1] + strength * (o[i + 1] - b[i + 1]))
      o[i + 2] = clampByte(o[i + 2] + strength * (o[i + 2] - b[i + 2]))
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.putImageData(origData, rx, ry)
    ctx.restore()
  } catch {
    drawSaturatedIntoClip()
  }
}

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

function getGlitchScratch(w: number, h: number): HTMLCanvasElement {
  if (!glitchScratch) {
    glitchScratch = document.createElement('canvas')
    glitchScratch.getContext('2d', { willReadFrequently: true })
  }
  if (glitchScratch.width !== w || glitchScratch.height !== h) {
    glitchScratch.width = w
    glitchScratch.height = h
  }
  return glitchScratch
}

function drawMacroBlock(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  blockPx: number
): void {
  if (destW <= 0 || destH <= 0) return
  const iw = Math.max(1, Math.floor(destW / blockPx))
  const ih = Math.max(1, Math.floor(destH / blockPx))
  const snap = getGlitchScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.imageSmoothingEnabled = false
  sctx.drawImage(source, destX, destY, destW, destH, 0, 0, iw, ih)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(snap, 0, 0, iw, ih, destX, destY, destW, destH)
  ctx.restore()
}

function applyPixelGlitchScan(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  playbackTime: number,
  intensity: number = 0.5
): void {
  if (rw <= 0 || rh <= 0) return

  const t = Math.max(0, Math.min(1, intensity))
  const V_WIDTH = 480
  const scale = rw / V_WIDTH
  const vHeight = rh / scale

  const blockVirt = 4 + Math.round(t * 16)
  const blockPx = Math.max(2, blockVirt * scale)
  const bandVirtH = 20

  const source = ctx.canvas

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  const scrollPeriod = 3.2
  const u = (playbackTime / scrollPeriod) % 1
  const yTopVirt = u * (vHeight + bandVirtH) - bandVirtH
  const v0 = Math.max(0, yTopVirt)
  const v1 = Math.min(vHeight, yTopVirt + bandVirtH)
  if (v1 > v0) {
    const stripY = ry + v0 * scale
    const stripH = (v1 - v0) * scale
    drawMacroBlock(ctx, source, rx, stripY, rw, stripH, blockPx)
  }

  const sporadicCycle = 2.6
  const sporadicFlash = 0.16
  const phase = playbackTime % sporadicCycle
  if (phase < sporadicFlash) {
    const seed = (Math.floor(playbackTime / sporadicCycle) * 1103515245 + 12345) >>> 0
    const rng = makeLCG(seed)
    const n = 3 + Math.floor(rng() * 5)
    for (let i = 0; i < n; i++) {
      const bw = 12 + rng() * 48
      const bh = 8 + rng() * 28
      const vx = rng() * Math.max(1, V_WIDTH - bw)
      const vy = rng() * Math.max(1, vHeight - bh)
      const dx = rx + vx * scale
      const dy = ry + vy * scale
      const dw = bw * scale
      const dh = bh * scale
      drawMacroBlock(ctx, source, dx, dy, dw, dh, blockPx)
    }
  }

  ctx.restore()
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
  intensity: number = 0.5,
  flashSpeed: number = 1
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

  const flashAmt = Math.max(0, Math.min(1, flashSpeed))
  const flashCycle =
    flashAmt <= 0 ? 1 : (Math.sin(playbackTime * (8 + flashAmt * 42)) + 1) / 2
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

function getBlurVignetteScratch(w: number, h: number): HTMLCanvasElement {
  if (!blurVignetteScratch) {
    blurVignetteScratch = document.createElement('canvas')
    blurVignetteScratch.getContext('2d', { willReadFrequently: true })
  }
  if (blurVignetteScratch.width !== w || blurVignetteScratch.height !== h) {
    blurVignetteScratch.width = w
    blurVignetteScratch.height = h
  }
  return blurVignetteScratch
}

function applyBlurVignette(
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
  const snap = getBlurVignetteScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  const source = ctx.canvas
  const blurPx = Math.max(1, (2 + t * 14) * (rw / 480))
  const cx = iw * 0.5
  const cy = ih * 0.5
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const inner = maxDist * (0.18 + (1 - t) * 0.22)
  const outer = maxDist * (0.55 + t * 0.4)

  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.filter = `blur(${blurPx}px)`
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  sctx.filter = 'none'

  sctx.globalCompositeOperation = 'destination-in'
  const mask = sctx.createRadialGradient(cx, cy, inner, cx, cy, outer)
  mask.addColorStop(0, 'rgba(0,0,0,0)')
  mask.addColorStop(1, 'rgba(0,0,0,1)')
  sctx.fillStyle = mask
  sctx.fillRect(0, 0, iw, ih)
  sctx.globalCompositeOperation = 'source-over'

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()
  ctx.drawImage(snap, 0, 0, iw, ih, rx, ry, rw, rh)
  ctx.restore()
}

function getGrainScratch(w: number, h: number): HTMLCanvasElement {
  if (!grainScratch) {
    grainScratch = document.createElement('canvas')
    grainScratch.getContext('2d', { willReadFrequently: true })
  }
  if (grainScratch.width !== w || grainScratch.height !== h) {
    grainScratch.width = w
    grainScratch.height = h
  }
  return grainScratch
}

function applyGrainy(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  playbackTime: number,
  intensity: number = 0.5
): void {
  if (rw <= 0 || rh <= 0) return
  const t = Math.max(0, Math.min(1, intensity))
  if (t <= 0) return

  const iw = Math.max(1, Math.round(rw))
  const ih = Math.max(1, Math.round(rh))
  const snap = getGrainScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  const source = ctx.canvas
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)

  try {
    const img = sctx.getImageData(0, 0, iw, ih)
    const d = img.data
    const fineGrain = 12 + t * 40
    const grainRng = makeLCG(Math.floor(playbackTime * 24))

    for (let i = 0; i < d.length; i += 4) {
      const n = (grainRng() - 0.5) * fineGrain
      d[i] = clampByte(d[i] + n)
      d[i + 1] = clampByte(d[i + 1] + n)
      d[i + 2] = clampByte(d[i + 2] + n)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.putImageData(img, rx, ry)

    const speckleRng = makeLCG(Math.floor(playbackTime * 24) ^ 0x9e3779b9)
    const grainAlpha = Math.min(1, 0.25 + t * 0.7)
    const refArea = 480 * Math.max(1, Math.round(480 * (rh / rw)))
    const grainPerLevel = Math.max(
      1,
      Math.round((450 + t * 1100) * ((iw * ih) / refArea))
    )
    const grainLevels = [65, 105, 145, 185] as const
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = grainAlpha
    for (const level of grainLevels) {
      ctx.fillStyle = `rgb(${level},${level},${level})`
      for (let gi = 0; gi < grainPerLevel; gi++) {
        ctx.fillRect(rx + speckleRng() * iw, ry + speckleRng() * ih, 1, 1)
      }
    }
    ctx.restore()
  } catch {
    return
  }
}

function applyBlackAndWhite(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): void {
  if (rw <= 0 || rh <= 0) return

  const iw = Math.max(1, Math.round(rw))
  const ih = Math.max(1, Math.round(rh))
  const snap = getBwScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  const source = ctx.canvas
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  try {
    const img = sctx.getImageData(0, 0, iw, ih)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = clampByte(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.putImageData(img, rx, ry)
    ctx.restore()
  } catch {
    return
  }
}

function getContrastScratch(w: number, h: number): HTMLCanvasElement {
  if (!contrastScratch) {
    contrastScratch = document.createElement('canvas')
    contrastScratch.getContext('2d', { willReadFrequently: true })
  }
  if (contrastScratch.width !== w || contrastScratch.height !== h) {
    contrastScratch.width = w
    contrastScratch.height = h
  }
  return contrastScratch
}

function applyContrast(
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
  const snap = getContrastScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  const source = ctx.canvas
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  try {
    const img = sctx.getImageData(0, 0, iw, ih)
    const d = img.data
    const shadowMul = 1 + 5.2 * t
    const highlightMul = 1 + 1.8 * t
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255
      const g = d[i + 1] / 255
      const b = d[i + 2] / 255
      const oldL = 0.2126 * r + 0.7152 * g + 0.0722 * b
      let L = oldL
      if (L < 0.5) {
        L = 0.5 - (0.5 - L) * shadowMul
      } else {
        L = 0.5 + (L - 0.5) * highlightMul
      }
      if (L < 0) L = 0
      else if (L > 1) L = 1
      if (oldL > 1e-6) {
        const scale = L / oldL
        d[i] = clampByte(d[i] * scale)
        d[i + 1] = clampByte(d[i + 1] * scale)
        d[i + 2] = clampByte(d[i + 2] * scale)
      } else {
        const v = clampByte(L * 255)
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
      }
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.putImageData(img, rx, ry)
    ctx.restore()
  } catch {
    return
  }
}

function getCoolToneScratch(w: number, h: number): HTMLCanvasElement {
  if (!coolToneScratch) {
    coolToneScratch = document.createElement('canvas')
    coolToneScratch.getContext('2d', { willReadFrequently: true })
  }
  if (coolToneScratch.width !== w || coolToneScratch.height !== h) {
    coolToneScratch.width = w
    coolToneScratch.height = h
  }
  return coolToneScratch
}

function applyCoolTone(
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
  const snap = getCoolToneScratch(iw, ih)
  const sctx = snap.getContext('2d', { willReadFrequently: true })
  if (!sctx) return

  const source = ctx.canvas
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, iw, ih)
  sctx.drawImage(source, rx, ry, rw, rh, 0, 0, iw, ih)
  try {
    const img = sctx.getImageData(0, 0, iw, ih)
    const d = img.data
    const dim = 1 - t * 0.14
    const warmPull = t * 0.32
    const blueLift = t * 0.28
    const tealMix = t * 0.1

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i]
      let g = d[i + 1]
      let b = d[i + 2]
      const warmth = Math.max(0, r - b) / 255
      r = r - warmth * warmPull * 90 - t * 18
      g = g - warmth * warmPull * 35 + (b - g) * tealMix * 0.35
      b = b + (255 - b) * blueLift * 0.45 + t * 12
      d[i] = clampByte(r * dim)
      d[i + 1] = clampByte(g * dim)
      d[i + 2] = clampByte(b * dim)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, ry, rw, rh)
    ctx.clip()
    ctx.clearRect(rx, ry, rw, rh)
    ctx.putImageData(img, rx, ry)
    ctx.restore()
  } catch {
    return
  }
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  type: EffectType,
  x: number,
  y: number,
  width: number,
  height: number,
  playbackTime: number,
  intensity: number = 0.5,
  contrast: number = 0.5,
  flashSpeed: number = 1
): void {
  if (type === 'crt-dither') {
    applyCrtDither(ctx, x, y, width, height, playbackTime)
  } else if (type === 'flashing-black-vignette') {
    applyFlashingBlackVignette(ctx, x, y, width, height, playbackTime, intensity, flashSpeed)
  } else if (type === 'blur-vignette') {
    applyBlurVignette(ctx, x, y, width, height, intensity)
  } else if (type === 'cool-tone') {
    applyCoolTone(ctx, x, y, width, height, intensity)
  } else if (type === 'black-and-white') {
    applyBlackAndWhite(ctx, x, y, width, height)
  } else if (type === 'contrast') {
    applyContrast(ctx, x, y, width, height, intensity)
  } else if (type === 'vivid-sharp') {
    applyVividSharp(ctx, x, y, width, height, intensity)
  } else if (type === 'pixel-glitch-scan') {
    applyPixelGlitchScan(ctx, x, y, width, height, playbackTime, intensity)
  } else if (type === 'grainy') {
    applyGrainy(ctx, x, y, width, height, playbackTime, intensity)
  }
}

export function applyActiveEffects(
  ctx: CanvasRenderingContext2D,
  effects: ReadonlyArray<{
    type: EffectType
    intensity: number
    contrast: number
    flashSpeed: number
  }>,
  x: number,
  y: number,
  width: number,
  height: number,
  playbackTime: number
): void {
  if (effects.length === 0 || width <= 0 || height <= 0) return

  const iw = Math.max(1, Math.round(width))
  const ih = Math.max(1, Math.round(height))
  let contentMask: Uint8Array | null = null
  try {
    const before = ctx.getImageData(x, y, iw, ih)
    contentMask = new Uint8Array(iw * ih)
    const d = before.data
    for (let p = 0, i = 0; p < contentMask.length; p++, i += 4) {
      contentMask[p] = d[i + 3] === 0 ? 0 : 1
    }
  } catch {
    contentMask = null
  }

  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i]
    applyEffect(
      ctx,
      eff.type,
      x,
      y,
      width,
      height,
      playbackTime,
      eff.intensity,
      eff.contrast,
      eff.flashSpeed
    )
  }

  if (!contentMask) return
  try {
    const after = ctx.getImageData(x, y, iw, ih)
    const d = after.data
    for (let p = 0, i = 0; p < contentMask.length; p++, i += 4) {
      if (contentMask[p] !== 0) continue
      d[i] = 0
      d[i + 1] = 0
      d[i + 2] = 0
      d[i + 3] = 0
    }
    ctx.putImageData(after, x, y)
  } catch {
    return
  }
}
