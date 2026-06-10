import { AnimationMode } from '@/app/models/ImageClass'
import { TransformParams } from './types'
import { applyJitter } from './jitter'
import { applyShake } from './shake'
import { applySlideShake } from './slideShake'
import { applyStandardZoom } from './zoom'
import { applyRotateAnimation } from './rotateAnimation'
import { applyStretchOutAnimation } from './stretchOutAnimation'

function withFlipAroundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  flipH: boolean,
  flipV: boolean,
  draw: () => void
) {
  const sx = flipH ? -1 : 1
  const sy = flipV ? -1 : 1
  if (sx === 1 && sy === 1) {
    draw()
    return
  }
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.scale(sx, sy)
  ctx.translate(-(x + w / 2), -(y + h / 2))
  draw()
  ctx.restore()
}

export function drawWithAnimation(params: TransformParams, imgEl: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap, animation: AnimationMode, progress: number, elapsedTime: number, zoomIntensity: number, itemDuration?: number, animationDuration?: number, zoomDistanceIntensity = 1): void {
  const animationParams: TransformParams = {
    ...params,
    imgEl,
    animation,
    progress,
    elapsedTime,
    zoomIntensity,
    zoomDistanceIntensity,
    itemDuration,
    animationDuration,
    prevEl: undefined,
    prevParams: undefined
  }

  const { ctx, sx, sy, sw, sh, x, y, w, h } = params
  const fh = !!params.flipHorizontal
  const fv = !!params.flipVertical

  withFlipAroundRect(ctx, x, y, w, h, fh, fv, () => {
    switch (animation) {
      case 'jitter':
        applyJitter(animationParams)
        break
      case 'shake':
        applyShake(animationParams)
        break
      case 'rotate':
        applyRotateAnimation(animationParams)
        break
      case 'stretch-out':
        applyStretchOutAnimation(animationParams)
        break
      case 'slide-shake-left':
      case 'slide-shake-right':
        applySlideShake(animationParams)
        break
      case 'zoom-in':
      case 'zoom-out':
        applyStandardZoom(animationParams)
        break
      default:
        ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
        break
    }
  })
}
