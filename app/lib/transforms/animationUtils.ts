import { AnimationMode } from '@/app/models/ImageClass'
import { TransformParams } from './types'
import { applyJitter } from './jitter'
import { applyShake } from './shake'
import { applyStandardZoom } from './zoom'

export function drawWithAnimation(params: TransformParams, imgEl: HTMLImageElement | HTMLVideoElement | ImageBitmap, animation: AnimationMode, progress: number, elapsedTime: number, zoomIntensity: number, itemDuration?: number, animationDuration?: number): void {
  const animationParams: TransformParams = {
    ...params,
    imgEl,
    animation,
    progress,
    elapsedTime,
    zoomIntensity,
    itemDuration,
    animationDuration,
    prevEl: undefined, // Clear these to avoid recursion
    prevParams: undefined
  }

  const { ctx, sx, sy, sw, sh, x, y, w, h } = params

  switch (animation) {
    case 'jitter':
      applyJitter(animationParams)
      break
    case 'shake':
      applyShake(animationParams)
      break
    case 'pulse':
      applyStandardZoom(animationParams)
      break
    default:
      ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h)
      break
  }
}
