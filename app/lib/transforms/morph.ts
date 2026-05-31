import type { TransformParams } from './types'
import { getMorphTextureSource, tryApplyMorphWebgl } from '@/app/lib/webgl/morphTransitionWebgl'

function morphCrossfadeEase(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

function drawMorphFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  flipHorizontal = false,
  flipVertical = false
): void {
  const sxScale = flipHorizontal ? -1 : 1
  const syScale = flipVertical ? -1 : 1
  ctx.save()
  if (sxScale !== 1 || syScale !== 1) {
    ctx.translate(x + w / 2, y + h / 2)
    ctx.scale(sxScale, syScale)
    ctx.translate(-(x + w / 2), -(y + h / 2))
  }
  ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function applyMorphCrossfadeFallback(params: TransformParams): void {
  const { ctx, prevEl, prevParams, progress } = params
  if (!prevEl || !prevParams || progress >= 1) return

  const ease = morphCrossfadeEase(progress)
  const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
  const prevSource = getMorphTextureSource(prevEl)
  if (!prevSource) return

  drawMorphFrame(ctx, prevSource, px, py, pw, ph, psx, psy, psw, psh, params.prevFlipHorizontal, params.prevFlipVertical)

  const nextSource = getMorphTextureSource(params.imgEl)
  if (!nextSource) return

  ctx.save()
  ctx.globalAlpha = ease
  drawMorphFrame(
    ctx,
    nextSource,
    params.x,
    params.y,
    params.w,
    params.h,
    params.sx,
    params.sy,
    params.sw,
    params.sh,
    params.flipHorizontal,
    params.flipVertical
  )
  ctx.restore()
}

let morphPathLock: 'webgl' | 'canvas' | null = null

export function applyMorph(params: TransformParams): void {
  const { prevEl, prevParams, progress } = params

  if (!prevEl || !prevParams || progress >= 1) return

  if (progress <= 0.02) {
    morphPathLock = null
  }

  if (morphPathLock !== 'canvas') {
    if (tryApplyMorphWebgl(params)) {
      morphPathLock = 'webgl'
      return
    }
    if (morphPathLock === null) {
      morphPathLock = 'canvas'
    }
  }

  applyMorphCrossfadeFallback(params)
}
