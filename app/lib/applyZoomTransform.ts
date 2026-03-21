import type { AnimationMode, TransitionMode } from '@/app/models/ImageClass'
import { drawWithAnimation } from './transforms/animationUtils'
import { applySplit } from './transforms/split'
import { applyFade } from './transforms/fade'
import { applySlide } from './transforms/slide'
import type { TransformParams } from './transforms/types'

export function applyZoomTransform(
  ctx: CanvasRenderingContext2D,
  animation: AnimationMode | undefined,
  transition: TransitionMode | undefined,
  progress: number,
  imgEl: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  cropSx = 0,
  cropSy = 0,
  cropSw = 1,
  cropSh = 1,
  zoomIntensity = 0.5,
  animationDuration?: number,
  elapsedTime = 0,
  prevEl?: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  prevAnimation?: AnimationMode,
  prevAnimationProgress?: number,
  prevElapsedTime?: number,
  prevZoomIntensity?: number,
  prevAnimationDuration?: number,
  prevParams?: {
    x: number;
    y: number;
    w: number;
    h: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  }
): void {
  let nw = 0
  let nh = 0
  if (imgEl instanceof HTMLImageElement) {
    nw = imgEl.naturalWidth
    nh = imgEl.naturalHeight
  } else if (imgEl instanceof HTMLVideoElement) {
    nw = imgEl.videoWidth
    nh = imgEl.videoHeight
  } else {
    nw = imgEl.width
    nh = imgEl.height
  }
  const sx = nw * (cropSx ?? 0)
  const sy = nh * (cropSy ?? 0)
  const sw = nw * (cropSw ?? 1)
  const sh = nh * (cropSh ?? 1)

  const params: TransformParams = {
    ctx, animation: animation ?? 'none', transition: transition ?? 'none', progress, imgEl, x, y, w, h, sx, sy, sw, sh,
    zoomIntensity: zoomIntensity !== undefined ? zoomIntensity : 0.5, animationDuration, elapsedTime, prevEl, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity, prevAnimationDuration, prevParams
  }

  ctx.save()
  // Clip to the target bounds to ensure everything (animations, transitions) stays within the video frame
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  const isSlideTransition = transition && transition.startsWith('slide-in-')

  if (isSlideTransition && prevEl && prevParams && progress < 1) {
    // 1. Draw previous item first (outgoing)
    const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
    drawWithAnimation(
      { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh },
      prevEl,
      prevAnimation ?? 'none',
      prevAnimationProgress ?? 0,
      prevElapsedTime ?? 0,
      prevZoomIntensity ?? 0.5,
      prevAnimationDuration
    )

    // 2. Draw current item sliding in on top (incoming)
    applySlide(params)
  } else {
    // Draw the current element with its animation
    drawWithAnimation(params, imgEl, animation ?? 'none', progress, elapsedTime, zoomIntensity !== undefined ? zoomIntensity : 0.5, animationDuration)

    // Handle transition overlay if active
    if (transition && transition !== 'none' && prevEl && prevParams && progress < 1) {
      if (transition === 'fade') {
        applyFade(params)
      } else {
        applySplit(params)
      }
    }
  }

  ctx.restore()
}
