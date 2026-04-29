import type { AnimationZoomEasing } from '@/app/models/ImageClass'
import type { TransformParams } from './types'

function easeOutQuad(v: number): number {
  return 1 - (1 - v) * (1 - v)
}

function easeInQuad(v: number): number {
  return v * v
}

function easedProgress(u: number, ease: AnimationZoomEasing): number {
  if (ease === 'fast-slow') return easeOutQuad(u)
  if (ease === 'slow-fast') return easeInQuad(u)
  return u
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
    const fallbackDuration = 1
    const requestedDuration = animationDuration && animationDuration > 0 ? animationDuration : fallbackDuration
    const dur = itemDuration && itemDuration > 0 ? Math.min(requestedDuration, itemDuration) : requestedDuration
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
