import type { AnimationZoomEasing } from '@/app/models/ImageClass'
import type { TransformParams } from './types'

function easeOutQuad(v: number): number {
  return 1 - (1 - v) * (1 - v)
}

function easeInQuad(v: number): number {
  return v * v
}

function easedProgress(u: number, ease: AnimationZoomEasing): number {
  return ease === 'fast-slow' ? easeOutQuad(u) : easeInQuad(u)
}

export function applyStandardZoom(params: TransformParams): void {
  const {
    ctx,
    animation,
    imgEl,
    x,
    y,
    w,
    h,
    sx,
    sy,
    sw,
    sh,
    zoomDistanceIntensity,
    itemDuration,
    elapsedTime,
    animationDuration,
    animationZoomEasing,
  } = params

  let t = 0
  const ease = animationZoomEasing ?? 'fast-slow'
  if (animation === 'zoom-in' || animation === 'zoom-out') {
    let dur = animationDuration
    if (dur === undefined || dur <= 0) {
      dur = itemDuration && itemDuration > 0 ? itemDuration : 1
    }
    const u = dur > 0 ? Math.min(1, Math.max(0, elapsedTime / dur)) : 0
    const f = easedProgress(u, ease)
    t = animation === 'zoom-in' ? f : 1 - f
  }

  const scale = 1 + t * zoomDistanceIntensity
  const zoomedSw = sw / scale
  const zoomedSh = sh / scale
  const zoomedSx = sx + (sw - zoomedSw) / 2
  const zoomedSy = sy + (sh - zoomedSh) / 2

  ctx.drawImage(imgEl, zoomedSx, zoomedSy, zoomedSw, zoomedSh, x, y, w, h)
}
