import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import {
  resolvePreviewVideoDrawSource,
  videoHasDecodedPreviewFrame,
} from '@/app/lib/previewVideoFrameCache'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import {
  clipsAreEffectivelyAdjacent,
  getSortedRowClips,
  isRowClipActiveAtTimelineTime,
  type TimelineRowClip,
} from '@/app/lib/timelineClipAdjacency'

export { getSortedRowClips, rowClipElapsedAtTime } from '@/app/lib/timelineClipAdjacency'

export interface MainItem {
  id: string
  type: 'video' | 'image'
  item: VideoClass | ImageClass
  startTime: number
  duration: number
}

const LOGICAL_W = 1080
const LOGICAL_H = 1920
const PL_EPS = 0.01

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
    flipHorizontal: item.flipHorizontal,
    flipVertical: item.flipVertical,
  }
}

export function clipsTransitionLayoutCompatible(a: VideoClass | ImageClass, b: VideoClass | ImageClass): boolean {
  const pa = resolvedClipPlacement(a)
  const pb = resolvedClipPlacement(b)
  const near = (u: number, v: number) => Math.abs(u - v) < PL_EPS
  const aAspect = pa.h !== 0 ? pa.w / pa.h : 0
  const bAspect = pb.h !== 0 ? pb.w / pb.h : 0
  return (
    near(pa.x, pb.x) &&
    near(pa.y, pb.y) &&
    near(pa.w, pb.w) &&
    near(pa.h, pb.h) &&
    near(aAspect, bAspect) &&
    pa.flipHorizontal === pb.flipHorizontal &&
    pa.flipVertical === pb.flipVertical
  )
}

export function getSortedRowItems(row: number, videos: VideoClass[], images: ImageClass[]): MainItem[] {
  return getSortedRowClips(row, videos, images) as MainItem[]
}


function resolveVideoDrawSource(
  el: HTMLVideoElement
): HTMLVideoElement | HTMLCanvasElement | null {
  if (!el.seeking && videoHasDecodedPreviewFrame(el)) {
    return el
  }
  return resolvePreviewVideoDrawSource(el)
}

function bitmapOrImageSize(el: HTMLImageElement | ImageBitmap): { w: number; h: number } {
  if (el instanceof HTMLImageElement) {
    return { w: el.naturalWidth, h: el.naturalHeight }
  }
  return { w: el.width, h: el.height }
}

function drawSourceSize(source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap): {
  w: number
  h: number
} {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight }
  }
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight }
  }
  return { w: source.width, h: source.height }
}

export type ResolveVideoDrawSource = (
  id: string,
  el: HTMLVideoElement
) => HTMLVideoElement | HTMLCanvasElement | null

function resolveClipVideoDrawSource(
  id: string,
  el: HTMLVideoElement | undefined,
  resolveVideoSource?: ResolveVideoDrawSource
): HTMLVideoElement | HTMLCanvasElement | null {
  if (!el) return null
  if (resolveVideoSource) return resolveVideoSource(id, el)
  return resolveVideoDrawSource(el)
}

export function renderClipTransitionPair(
  ctx: CanvasRenderingContext2D,
  cr: { x: number; y: number; width: number; height: number },
  t: number,
  activeClip: MainItem,
  nextClip: MainItem,
  transProgress: number,
  getVideo: (id: string) => HTMLVideoElement | undefined,
  getImage: (id: string) => HTMLImageElement | ImageBitmap | undefined,
  resolveVideoSource?: ResolveVideoDrawSource
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

  let nextDraw: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap | null = null

  if (nextClip.type === 'video') {
    const nv = nextClip.item as VideoClass
    const el = getVideo(nextClip.id)
    const draw = resolveClipVideoDrawSource(nextClip.id, el, resolveVideoSource)
    if (el && draw) {
      const { w: nw, h: nh } = drawSourceSize(draw)
      const kn = resolveMediaKeyframeTransform(nv, elapsedB, nv.duration ?? 0)
      nextParams = {
        x: cr.x + kn.x * xScale,
        y: cr.y + kn.y * yScale,
        w: kn.width * xScale,
        h: kn.height * yScale,
        sx: nw * kn.cropSx,
        sy: nh * kn.cropSy,
        sw: nw * kn.cropSw,
        sh: nh * kn.cropSh,
      }
      nextEl = el
      nextDraw = draw
    }
  } else {
    const ni = nextClip.item as ImageClass
    const el = getImage(nextClip.id)
    if (el) {
      const kn = resolveMediaKeyframeTransform(ni, elapsedB, ni.duration)
      const { w: nw, h: nh } = bitmapOrImageSize(el)
      nextParams = {
        x: cr.x + kn.x * xScale,
        y: cr.y + kn.y * yScale,
        w: kn.width * xScale,
        h: kn.height * yScale,
        sx: nw * kn.cropSx,
        sy: nh * kn.cropSy,
        sw: nw * kn.cropSw,
        sh: nh * kn.cropSh,
      }
      nextEl = el
      nextDraw = el
    }
  }

  let curEl: HTMLVideoElement | HTMLImageElement | ImageBitmap | null = null
  let curParams: typeof nextParams | undefined
  let curDraw: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap | null = null

  if (activeClip.type === 'video') {
    const av = activeClip.item as VideoClass
    const el = getVideo(activeClip.id)
    const draw = resolveClipVideoDrawSource(activeClip.id, el, resolveVideoSource)
    if (el && draw) {
      const { w: cw, h: ch } = drawSourceSize(draw)
      const ka = resolveMediaKeyframeTransform(av, elapsedA, av.duration ?? 0)
      curParams = {
        x: cr.x + ka.x * xScale,
        y: cr.y + ka.y * yScale,
        w: ka.width * xScale,
        h: ka.height * yScale,
        sx: cw * ka.cropSx,
        sy: ch * ka.cropSy,
        sw: cw * ka.cropSw,
        sh: ch * ka.cropSh,
      }
      curEl = el
      curDraw = draw
    }
  } else {
    const ai = activeClip.item as ImageClass
    const el = getImage(activeClip.id)
    if (el) {
      const ka = resolveMediaKeyframeTransform(ai, elapsedA, ai.duration)
      const { w: cw, h: ch } = bitmapOrImageSize(el)
      curParams = {
        x: cr.x + ka.x * xScale,
        y: cr.y + ka.y * yScale,
        w: ka.width * xScale,
        h: ka.height * yScale,
        sx: cw * ka.cropSx,
        sy: ch * ka.cropSy,
        sw: cw * ka.cropSw,
        sh: ch * ka.cropSh,
      }
      curEl = el
      curDraw = el
    }
  }

  if (!curEl || !curParams || !curDraw) return false

  if (!nextEl || !nextParams || !nextDraw) {
    if (nextClip.item.transition === 'flash' && transProgress < 0.5) {
      const activeItem = activeClip.item
      const nextItem = nextClip.item
      const progA = calculateAnimationProgress(activeItem, t, activeClip.startTime)
      const ka =
        activeClip.type === 'video'
          ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
          : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)
      applyZoomTransform(
        ctx,
        activeItem.animation,
        'flash',
        transProgress,
        curDraw,
        curParams.x,
        curParams.y,
        curParams.w,
        curParams.h,
        ka.cropSx,
        ka.cropSy,
        ka.cropSw,
        ka.cropSh,
        ka.zoomIntensity,
        activeItem.duration,
        activeItem.animationDuration,
        elapsedA,
        curDraw,
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
        nextItem.transitionWipeEasing,
        nextItem.animationZoomEasing,
        activeItem.animationZoomEasing,
        nextItem.zoomDistanceIntensity,
        activeItem.zoomDistanceIntensity,
        activeItem.flipHorizontal,
        activeItem.flipVertical,
        activeItem.flipHorizontal,
        activeItem.flipVertical
      )
      return true
    }
    if (nextClip.item.transition === 'morph') {
      const activeItem = activeClip.item
      const progA = calculateAnimationProgress(activeItem, t, activeClip.startTime)
      const ka =
        activeClip.type === 'video'
          ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
          : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)
      applyZoomTransform(
        ctx,
        activeItem.animation,
        'none',
        progA,
        curDraw,
        curParams.x,
        curParams.y,
        curParams.w,
        curParams.h,
        ka.cropSx,
        ka.cropSy,
        ka.cropSw,
        ka.cropSh,
        ka.zoomIntensity,
        activeItem.duration,
        activeItem.animationDuration,
        elapsedA,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        activeItem.transitionColor,
        activeItem.transitionFlashMode,
        activeItem.transitionDirection,
        activeItem.transitionAxis,
        activeItem.transitionSlideEasing,
        activeItem.transitionCircleEasing,
        activeItem.transitionWipeEasing,
        activeItem.animationZoomEasing,
        undefined,
        activeItem.zoomDistanceIntensity,
        undefined,
        activeItem.flipHorizontal,
        activeItem.flipVertical,
        false,
        false
      )
      return true
    }
    const activeItem = activeClip.item
    const progA = calculateAnimationProgress(activeItem, t, activeClip.startTime)
    const ka =
      activeClip.type === 'video'
        ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
        : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)
    applyZoomTransform(
      ctx,
      activeItem.animation,
      'none',
      progA,
      curDraw,
      curParams.x,
      curParams.y,
      curParams.w,
      curParams.h,
      ka.cropSx,
      ka.cropSy,
      ka.cropSw,
      ka.cropSh,
      ka.zoomIntensity,
      activeItem.duration,
      activeItem.animationDuration,
      elapsedA,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      activeItem.transitionColor,
      activeItem.transitionFlashMode,
      activeItem.transitionDirection,
      activeItem.transitionAxis,
      activeItem.transitionSlideEasing,
      activeItem.transitionCircleEasing,
      activeItem.transitionWipeEasing,
      activeItem.animationZoomEasing,
      undefined,
      activeItem.zoomDistanceIntensity,
      undefined,
      activeItem.flipHorizontal,
      activeItem.flipVertical,
      false,
      false
    )
    return true
  }

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

  if (nextItem.transition === 'wipe') {
    const direction = nextItem.transitionDirection ?? 'right'
    const p = Math.max(0, Math.min(1, transProgress))
    let revealX = nextParams.x
    let revealY = nextParams.y
    let revealW = nextParams.w
    let revealH = nextParams.h
    if (direction === 'right') {
      revealW = nextParams.w * p
    } else if (direction === 'left') {
      revealW = nextParams.w * p
      revealX = nextParams.x + nextParams.w - revealW
    } else if (direction === 'down' || direction === 'bottom') {
      revealH = nextParams.h * p
    } else {
      revealH = nextParams.h * p
      revealY = nextParams.y + nextParams.h - revealH
    }

    applyZoomTransform(
      ctx,
      activeItem.animation,
      'none',
      progA,
      curDraw,
      curParams.x,
      curParams.y,
      curParams.w,
      curParams.h,
      ka.cropSx,
      ka.cropSy,
      ka.cropSw,
      ka.cropSh,
      ka.zoomIntensity,
      activeItem.duration,
      activeItem.animationDuration,
      elapsedA,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      activeItem.transitionColor,
      activeItem.transitionFlashMode,
      activeItem.transitionDirection,
      activeItem.transitionAxis,
      activeItem.transitionSlideEasing,
      activeItem.transitionCircleEasing,
      activeItem.transitionWipeEasing,
      activeItem.animationZoomEasing,
      undefined,
      activeItem.zoomDistanceIntensity,
      undefined,
      activeItem.flipHorizontal,
      activeItem.flipVertical,
      false,
      false
    )

    ctx.save()
    ctx.beginPath()
    ctx.rect(revealX, revealY, revealW, revealH)
    ctx.clip()
    applyZoomTransform(
      ctx,
      nextItem.animation,
      'none',
      progB,
      nextDraw,
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
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      nextItem.transitionColor,
      nextItem.transitionFlashMode,
      nextItem.transitionDirection,
      nextItem.transitionAxis,
      nextItem.transitionSlideEasing,
      nextItem.transitionCircleEasing,
      nextItem.transitionWipeEasing,
      nextItem.animationZoomEasing,
      undefined,
      nextItem.zoomDistanceIntensity,
      undefined,
      nextItem.flipHorizontal,
      nextItem.flipVertical,
      false,
      false
    )
    ctx.restore()
    return true
  }

  applyZoomTransform(
    ctx,
    nextItem.animation,
    nextItem.transition,
    transProgress,
    nextDraw!,
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
    curDraw,
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
    nextItem.transitionWipeEasing,
    nextItem.animationZoomEasing,
    activeItem.animationZoomEasing,
    nextItem.zoomDistanceIntensity,
    activeItem.zoomDistanceIntensity,
    nextItem.flipHorizontal,
    nextItem.flipVertical,
    activeItem.flipHorizontal,
    activeItem.flipVertical
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

export function mirrorVideoTimelineElapsed(
  video: VideoClass,
  elapsedInClip: number,
  clipDuration: number
): number {
  if (!video.reversed) return elapsedInClip
  const D = clipDuration > 0 ? clipDuration : 0
  const clamped = Math.max(0, Math.min(elapsedInClip, D))
  return Math.max(0, D - clamped)
}

export function videoTimelineSourceMapping(
  video: VideoClass,
  elapsedInClip: number,
  clipDuration: number
): { sourceElapsed: number; playSpan: number; inHold: boolean } {
  const D = clipDuration > 0 ? clipDuration : 0
  const elapsed = mirrorVideoTimelineElapsed(video, elapsedInClip, D)
  const span = clipTimelineSpanForSourceMap(clipDuration)
  const speedStart = video.speedStart ?? video.playbackSpeed ?? 1
  const speedEnd = video.speedEnd ?? video.playbackSpeed ?? 1
  const baseSpeed = video.playbackSpeed ?? 1
  const easing = video.speedEasing

  if ((video.animation as string) !== 'last-frame-hold') {
    const e = Math.max(0, Math.min(elapsed, D))
    const sourceElapsed = calculateSourceTime(e, span, speedStart, speedEnd, baseSpeed, easing)
    return { sourceElapsed, playSpan: D > 0 ? D : 0.1, inHold: false }
  }

  const holdRaw = video.animationDuration ?? 0
  const hold = Math.max(0, Math.min(holdRaw, D))
  const playSpan = D - hold
  const e = Math.max(0, elapsed)

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

export function videoInstantaneousPlaybackSpeed(
  video: VideoClass,
  elapsedInClip: number,
  clipDuration: number
): number {
  const D = clipDuration > 0 ? clipDuration : 0.1
  const t = Math.max(0, Math.min(elapsedInClip, D))
  const x = t / D
  const speedStart = video.speedStart ?? video.playbackSpeed ?? 1
  const speedEnd = video.speedEnd ?? video.playbackSpeed ?? 1
  if (Math.abs(speedStart - speedEnd) < 0.001) return speedStart
  return speedStart + x * (speedEnd - speedStart)
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

export function findActiveAndNextItems(items: MainItem[], time: number, videos?: VideoClass[]) {
  let activeIdx = -1
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (isRowClipActiveAtTimelineTime(items as TimelineRowClip[], it as TimelineRowClip, time, videos)) {
      activeIdx = i
    }
  }
  const activeItem = activeIdx !== -1 ? items[activeIdx] : null
  const nextItem =
    activeIdx !== -1 && activeIdx < items.length - 1 ? items[activeIdx + 1] : items.find((it) => it.startTime > time) || null

  if (activeItem && activeIdx > 0 && activeItem.item.transition === 'flash') {
    const previousItem = items[activeIdx - 1]
    const adjacent = clipsAreEffectivelyAdjacent(previousItem as TimelineRowClip, activeItem as TimelineRowClip)
    const rawTransDur = Math.max(0.1, activeItem.item.transitionDuration ?? 1.0)
    const transDur = Math.min(rawTransDur, previousItem.duration, activeItem.duration)
    const halfDur = transDur * 0.5
    if (adjacent && time >= activeItem.startTime && time < activeItem.startTime + halfDur) {
      return { activeItem: previousItem, nextItem: activeItem }
    }
  }

  return { activeItem, nextItem }
}

export function checkTransition(activeItem: MainItem | null, nextItem: MainItem | null, time: number) {
  if (!activeItem || !nextItem) return { transitionActive: false, progress: 0 }

  const isTransitionType = nextItem.item.transition !== 'none'
  if (!isTransitionType) return { transitionActive: false, progress: 0 }
  const adjacent = clipsAreEffectivelyAdjacent(activeItem as TimelineRowClip, nextItem as TimelineRowClip)
  if (!adjacent) return { transitionActive: false, progress: 0 }

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
