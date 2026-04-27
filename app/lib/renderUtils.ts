import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'

export interface MainItem {
  id: string
  type: 'video' | 'image'
  item: VideoClass | ImageClass
  startTime: number
  duration: number
}

const LOGICAL_W = 1080
const LOGICAL_H = 1920
const PL_EPS = 0.001

export function resolvedClipPlacement(item: VideoClass | ImageClass) {
  return {
    x: item.x ?? 0,
    y: item.y ?? 0,
    w: item.width ?? LOGICAL_W,
    h: item.height ?? LOGICAL_H,
    cropAspect: item.cropAspect ?? '',
    cropSx: item.cropSx,
    cropSy: item.cropSy,
    cropSw: item.cropSw,
    cropSh: item.cropSh,
    rotation: item instanceof ImageClass ? item.rotation : 0,
  }
}

export function clipsTransitionLayoutCompatible(a: VideoClass | ImageClass, b: VideoClass | ImageClass): boolean {
  const pa = resolvedClipPlacement(a)
  const pb = resolvedClipPlacement(b)
  const near = (u: number, v: number) => Math.abs(u - v) < PL_EPS
  return (
    near(pa.x, pb.x) &&
    near(pa.y, pb.y) &&
    near(pa.w, pb.w) &&
    near(pa.h, pb.h) &&
    pa.cropAspect === pb.cropAspect &&
    near(pa.cropSx, pb.cropSx) &&
    near(pa.cropSy, pb.cropSy) &&
    near(pa.cropSw, pb.cropSw) &&
    near(pa.cropSh, pb.cropSh) &&
    near(pa.rotation, pb.rotation)
  )
}

export function getSortedRowItems(row: number, videos: VideoClass[], images: ImageClass[]): MainItem[] {
  return [
    ...videos.filter((v) => v.row === row).map((v) => ({
      id: v.id,
      type: 'video' as const,
      item: v,
      startTime: v.timestamp,
      duration: v.duration || 0,
    })),
    ...images.filter((img) => img.row === row).map((img) => ({
      id: img.id,
      type: 'image' as const,
      item: img,
      startTime: img.startTime,
      duration: img.duration,
    })),
  ].sort((a, b) => a.startTime - b.startTime)
}

function videoHasDrawableFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= 1
}

function bitmapOrImageSize(el: HTMLImageElement | ImageBitmap): { w: number; h: number } {
  if (el instanceof HTMLImageElement) {
    return { w: el.naturalWidth, h: el.naturalHeight }
  }
  return { w: el.width, h: el.height }
}

export function renderClipTransitionPair(
  ctx: CanvasRenderingContext2D,
  cr: { x: number; y: number; width: number; height: number },
  t: number,
  activeClip: MainItem,
  nextClip: MainItem,
  transProgress: number,
  getVideo: (id: string) => HTMLVideoElement | undefined,
  getImage: (id: string) => HTMLImageElement | ImageBitmap | undefined
): boolean {
  const logicalW = LOGICAL_W
  const logicalH = LOGICAL_H
  const xScale = cr.width / logicalW
  const yScale = cr.height / logicalH
  const elapsedB = Math.max(0, t - nextClip.startTime)
  const elapsedA = Math.max(0, t - activeClip.startTime)

  let nextEl: HTMLVideoElement | HTMLImageElement | ImageBitmap | null = null
  let nextParams:
    | {
        x: number
        y: number
        w: number
        h: number
        sx: number
        sy: number
        sw: number
        sh: number
      }
    | undefined

  if (nextClip.type === 'video') {
    const nv = nextClip.item as VideoClass
    const el = getVideo(nextClip.id)
    if (el && videoHasDrawableFrame(el)) {
      const kn = resolveMediaKeyframeTransform(nv, elapsedB, nv.duration ?? 0)
      nextParams = {
        x: cr.x + (nv.x ?? 0) * xScale,
        y: cr.y + (nv.y ?? 0) * yScale,
        w: (nv.width ?? logicalW) * xScale,
        h: (nv.height ?? logicalH) * yScale,
        sx: el.videoWidth * kn.cropSx,
        sy: el.videoHeight * kn.cropSy,
        sw: el.videoWidth * kn.cropSw,
        sh: el.videoHeight * kn.cropSh,
      }
      nextEl = el
    }
  } else {
    const ni = nextClip.item as ImageClass
    const el = getImage(nextClip.id)
    if (el) {
      const kn = resolveMediaKeyframeTransform(ni, elapsedB, ni.duration)
      const { w: nw, h: nh } = bitmapOrImageSize(el)
      nextParams = {
        x: cr.x + ni.x * xScale,
        y: cr.y + ni.y * yScale,
        w: ni.width * xScale,
        h: ni.height * yScale,
        sx: nw * kn.cropSx,
        sy: nh * kn.cropSy,
        sw: nw * kn.cropSw,
        sh: nh * kn.cropSh,
      }
      nextEl = el
    }
  }

  if (!nextEl || !nextParams) return false

  let curEl: HTMLVideoElement | HTMLImageElement | ImageBitmap | null = null
  let curParams: typeof nextParams | undefined

  if (activeClip.type === 'video') {
    const av = activeClip.item as VideoClass
    const el = getVideo(activeClip.id)
    if (el && videoHasDrawableFrame(el)) {
      const ka = resolveMediaKeyframeTransform(av, elapsedA, av.duration ?? 0)
      curParams = {
        x: cr.x + (av.x ?? 0) * xScale,
        y: cr.y + (av.y ?? 0) * yScale,
        w: (av.width ?? logicalW) * xScale,
        h: (av.height ?? logicalH) * yScale,
        sx: el.videoWidth * ka.cropSx,
        sy: el.videoHeight * ka.cropSy,
        sw: el.videoWidth * ka.cropSw,
        sh: el.videoHeight * ka.cropSh,
      }
      curEl = el
    }
  } else {
    const ai = activeClip.item as ImageClass
    const el = getImage(activeClip.id)
    if (el) {
      const ka = resolveMediaKeyframeTransform(ai, elapsedA, ai.duration)
      const { w: cw, h: ch } = bitmapOrImageSize(el)
      curParams = {
        x: cr.x + ai.x * xScale,
        y: cr.y + ai.y * yScale,
        w: ai.width * xScale,
        h: ai.height * yScale,
        sx: cw * ka.cropSx,
        sy: ch * ka.cropSy,
        sw: cw * ka.cropSw,
        sh: ch * ka.cropSh,
      }
      curEl = el
    }
  }

  if (!curEl || !curParams) return false

  const nextItem = nextClip.item
  const activeItem = activeClip.item
  const progB = calculateAnimationProgress(nextItem, t, nextClip.startTime)
  const progA = calculateAnimationProgress(activeItem, t, activeClip.startTime)
  const kn =
    nextClip.type === 'video'
      ? resolveMediaKeyframeTransform(nextItem as VideoClass, elapsedB, (nextItem as VideoClass).duration ?? 0)
      : resolveMediaKeyframeTransform(nextItem as ImageClass, elapsedB, (nextItem as ImageClass).duration)
  const ka =
    activeClip.type === 'video'
      ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
      : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)

  applyZoomTransform(
    ctx,
    nextItem.animation,
    nextItem.transition,
    transProgress,
    nextEl,
    nextParams.x,
    nextParams.y,
    nextParams.w,
    nextParams.h,
    kn.cropSx,
    kn.cropSy,
    kn.cropSw,
    kn.cropSh,
    kn.zoomIntensity,
    nextItem.duration,
    nextItem.animationDuration,
    elapsedB,
    curEl,
    activeItem.animation,
    progA,
    elapsedA,
    ka.zoomIntensity,
    activeItem.duration,
    activeItem.animationDuration,
    curParams,
    nextItem.transitionColor,
    nextItem.transitionFlashMode,
    nextItem.transitionDirection,
    nextItem.transitionAxis,
    nextItem.transitionSlideEasing,
    nextItem.transitionCircleEasing,
    nextItem.animationZoomEasing,
    activeItem.animationZoomEasing,
    nextItem.zoomDistanceIntensity,
    activeItem.zoomDistanceIntensity
  )
  return true
}

export function calculateAnimationProgress(item: VideoClass | ImageClass, currentTime: number, startTime: number): number {
  const elapsed = currentTime - startTime
  const duration = (item as any).startTime !== undefined ? (item as ImageClass).duration : (item as VideoClass).duration
  return duration && duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 0
}

export function clipTimelineSpanForSourceMap(duration: number | undefined | null): number {
  const d = duration ?? 0
  return d > 0 ? d : 0
}

export function videoTimelineSourceMapping(
  video: VideoClass,
  elapsedInClip: number,
  clipDuration: number
): { sourceElapsed: number; playSpan: number; inHold: boolean } {
  const D = clipDuration > 0 ? clipDuration : 0
  const span = clipTimelineSpanForSourceMap(clipDuration)
  const speedStart = video.speedStart ?? video.playbackSpeed ?? 1
  const speedEnd = video.speedEnd ?? video.playbackSpeed ?? 1
  const baseSpeed = video.playbackSpeed ?? 1
  const easing = video.speedEasing

  if (video.animation !== 'last-frame-hold') {
    const e = Math.max(0, Math.min(elapsedInClip, D))
    const sourceElapsed = calculateSourceTime(e, span, speedStart, speedEnd, baseSpeed, easing)
    return { sourceElapsed, playSpan: D > 0 ? D : 0.1, inHold: false }
  }

  const holdRaw = video.animationDuration ?? 0
  const hold = Math.max(0, Math.min(holdRaw, D))
  const playSpan = D - hold
  const e = Math.max(0, elapsedInClip)

  if (hold <= 0) {
    const sourceElapsed = calculateSourceTime(Math.min(e, D), span, speedStart, speedEnd, baseSpeed, easing)
    return { sourceElapsed, playSpan: D > 0 ? D : 0.1, inHold: false }
  }

  if (playSpan <= 0) {
    const sourceElapsed = calculateSourceTime(D, span, speedStart, speedEnd, baseSpeed, easing)
    return { sourceElapsed, playSpan: Math.max(0.001, D), inHold: true }
  }

  const inHold = e >= playSpan - 1e-6
  if (inHold) {
    const sourceAtEnd = calculateSourceTime(playSpan, playSpan, speedStart, speedEnd, baseSpeed, easing)
    return { sourceElapsed: sourceAtEnd, playSpan, inHold: true }
  }
  const sourceElapsed = calculateSourceTime(e, playSpan, speedStart, speedEnd, baseSpeed, easing)
  return { sourceElapsed, playSpan, inHold: false }
}

export function timelineClipSourceSpanSeconds(
  timelineDuration: number,
  playbackSpeed: number,
  speedStart?: number,
  speedEnd?: number,
  easing: 'linear' | 'ease' = 'linear'
): number {
  const D = timelineDuration
  if (!(D > 0)) return 0
  const ps = playbackSpeed
  const ss = speedStart ?? ps
  const se = speedEnd ?? ps
  return calculateSourceTime(D, D, ss, se, ps, easing)
}

export function calculateSourceTime(
  elapsedTimelineTime: number,
  timelineDuration: number,
  speedStart: number,
  speedEnd: number,
  basePlaybackSpeed: number,
  easing: 'linear' | 'ease' = 'linear'
): number {
  const D = Math.max(0.1, timelineDuration)
  const t = Math.max(0, elapsedTimelineTime)

  if (easing === 'ease') {
    const x = t / D
    const Fx = Math.pow(x, 3) - 0.5 * Math.pow(x, 4)
    return speedStart * t + (speedEnd - speedStart) * D * Fx
  }

  if (Math.abs(speedStart - speedEnd) < 0.001) {
    return t * speedStart
  }

  return speedStart * t + (Math.pow(t, 2) / (2 * D)) * (speedEnd - speedStart)
}

export function findActiveAndNextItems(items: MainItem[], time: number) {
  let activeIdx = -1
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (time >= it.startTime && time < it.startTime + it.duration) activeIdx = i
  }
  const activeItem = activeIdx !== -1 ? items[activeIdx] : null
  const nextItem =
    activeIdx !== -1 && activeIdx < items.length - 1 ? items[activeIdx + 1] : items.find((it) => it.startTime > time) || null

  if (activeItem && activeIdx > 0 && activeItem.item.transition === 'flash') {
    const previousItem = items[activeIdx - 1]
    const adjacent = Math.abs(previousItem.startTime + previousItem.duration - activeItem.startTime) < 0.01
    const compatible = clipsTransitionLayoutCompatible(previousItem.item, activeItem.item)
    const rawTransDur = Math.max(0.1, activeItem.item.transitionDuration ?? 1.0)
    const transDur = Math.min(rawTransDur, previousItem.duration, activeItem.duration)
    const halfDur = transDur * 0.5
    if (adjacent && compatible && time >= activeItem.startTime && time < activeItem.startTime + halfDur) {
      return { activeItem: previousItem, nextItem: activeItem }
    }
  }

  return { activeItem, nextItem }
}

export function checkTransition(activeItem: MainItem | null, nextItem: MainItem | null, time: number) {
  if (!activeItem || !nextItem) return { transitionActive: false, progress: 0 }

  const isTransitionType = nextItem.item.transition !== 'none'
  if (!isTransitionType) return { transitionActive: false, progress: 0 }

  const isFlashTransition = nextItem.item.transition === 'flash'
  if (!isFlashTransition && !clipsTransitionLayoutCompatible(activeItem.item, nextItem.item)) {
    return { transitionActive: false, progress: 0 }
  }

  const rawTransDur = Math.max(0.1, nextItem.item.transitionDuration ?? 1.0)
  const transDur = Math.min(rawTransDur, activeItem.duration, nextItem.duration)
  if (isFlashTransition) {
    const halfDur = transDur * 0.5
    const start = nextItem.startTime - halfDur
    const end = nextItem.startTime + halfDur
    const transitionActive = time >= start && time <= end
    const progress = transDur > 0 ? Math.max(0, Math.min(1, (time - start) / transDur)) : 1
    return { transitionActive, progress }
  }

  const timeUntilNext = nextItem.startTime - time
  const transitionActive = timeUntilNext >= 0 && timeUntilNext <= transDur
  const progress = transDur > 0 ? Math.max(0, Math.min(1, 1 - timeUntilNext / transDur)) : 1

  return { transitionActive, progress }
}
