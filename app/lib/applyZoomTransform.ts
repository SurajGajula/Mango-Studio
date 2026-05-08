import type {
  AnimationMode,
  AnimationZoomEasing,
  FlashTransitionMode,
  SlideTransitionEasing,
  WipeTransitionEasing,
  TransitionMode,
} from '@/app/models/ImageClass'
import { drawWithAnimation } from './transforms/animationUtils'
import { applySplit } from './transforms/split'
import { applyFade } from './transforms/fade'
import { applyMorph } from './transforms/morph'
import { applyFlash } from './transforms/flash'
import { applySlide } from './transforms/slide'
import { applyCircle } from './transforms/circle'
import { applyRotate } from './transforms/rotate'
import { applyWipe } from './transforms/wipe'
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
  itemDuration?: number,
  animationDuration?: number,
  elapsedTime = 0,
  prevEl?: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  prevAnimation?: AnimationMode,
  prevAnimationProgress?: number,
  prevElapsedTime?: number,
  prevZoomIntensity?: number,
  prevItemDuration?: number,
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
  },
  transitionColor?: string,
  transitionFlashMode?: FlashTransitionMode,
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom' | 'up' | 'down',
  transitionAxis?: 'horizontal' | 'vertical',
  transitionSlideEasing?: SlideTransitionEasing,
  transitionCircleEasing?: SlideTransitionEasing,
  transitionWipeEasing?: WipeTransitionEasing,
  animationZoomEasing?: AnimationZoomEasing,
  prevAnimationZoomEasing?: AnimationZoomEasing,
  zoomDistanceIntensity = 1,
  prevZoomDistanceIntensity = 1,
  flipHorizontal = false,
  flipVertical = false,
  prevFlipHorizontal = false,
  prevFlipVertical = false
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
    zoomIntensity: zoomIntensity !== undefined ? zoomIntensity : 0.5,
    zoomDistanceIntensity: zoomDistanceIntensity !== undefined ? zoomDistanceIntensity : 1,
    itemDuration, animationDuration, animationZoomEasing: animationZoomEasing ?? 'fast-slow', elapsedTime, prevEl, prevAnimation, prevAnimationProgress, prevElapsedTime, prevZoomIntensity, prevZoomDistanceIntensity, prevItemDuration, prevAnimationDuration, prevParams,
    transitionColor, transitionFlashMode, transitionDirection, transitionAxis, transitionSlideEasing, transitionCircleEasing, transitionWipeEasing,
    flipHorizontal,
    flipVertical,
    prevFlipHorizontal,
    prevFlipVertical,
  }

  ctx.save()
  // Clip to the target bounds so transition frames never spill outside the item
  // or outside the 9:16 preview content rect for full-frame media.
  const isSlideTransition = transition === 'slide-in'
  const isCircleTransition = transition === 'circle'
  const isWipeTransition = transition === 'wipe'

  // Optimization: Only clip if necessary.
  // Clipping is expensive. If the item is a standard full-frame item with no
  // transition, we can skip it.
  const isFullFrame = Math.abs(x) < 0.1 && Math.abs(y) < 0.1 && Math.abs(w - ctx.canvas.width) < 0.1 && Math.abs(h - ctx.canvas.height) < 0.1
  const needsClip = !isFullFrame || (transition && transition !== 'none')

  if (needsClip) {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
  }

  if ((isSlideTransition || isCircleTransition || isWipeTransition || transition === 'rotate') && prevEl && prevParams && progress < 1) {
    // 1. Draw previous item first (outgoing)
    if (transition === 'rotate') {
      applyRotate(params)
    } else {
      const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
      drawWithAnimation(
        { ...params, x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh, animationZoomEasing: prevAnimationZoomEasing ?? 'fast-slow', flipHorizontal: params.prevFlipHorizontal, flipVertical: params.prevFlipVertical },
        prevEl,
        prevAnimation ?? 'none',
        prevAnimationProgress ?? 0,
        prevElapsedTime ?? 0,
        prevZoomIntensity ?? 0.5,
        prevItemDuration,
        prevAnimationDuration,
        prevZoomDistanceIntensity ?? 1
      )

      // 2. Draw current item on top (incoming)
      if (isCircleTransition) {
        applyCircle(params)
      } else if (isWipeTransition) {
        applyWipe(params)
      } else {
        applySlide(params)
      }
    }
  } else if (transition === 'morph' && prevEl && prevParams && progress < 1) {
    applyMorph(params)
  } else {
    drawWithAnimation(
      params,
      imgEl,
      animation ?? 'none',
      progress,
      elapsedTime,
      zoomIntensity !== undefined ? zoomIntensity : 0.5,
      itemDuration,
      animationDuration,
      zoomDistanceIntensity !== undefined ? zoomDistanceIntensity : 1
    )

    if (transition && transition !== 'none' && prevEl && prevParams && progress < 1) {
      if (transition === 'fade') {
        applyFade(params)
      } else if (transition === 'flash') {
        applyFlash(params)
      } else if (transition === 'split') {
        applySplit(params)
      }
    }
  }

  ctx.restore()
}
