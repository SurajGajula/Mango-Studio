import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'

export interface MainItem {
  id: string
  type: 'video' | 'image'
  item: VideoClass | ImageClass
  startTime: number
  duration: number
}

export function getSortedMainItems(videos: VideoClass[], images: ImageClass[]): MainItem[] {
  return [
    ...videos.filter(v => !v.isOverlay).map(v => ({
      id: v.id,
      type: 'video' as const,
      item: v,
      startTime: v.timestamp,
      duration: v.duration || 0
    })),
    ...images.filter(img => img.isMainTrack).map(img => ({
      id: img.id,
      type: 'image' as const,
      item: img,
      startTime: img.startTime,
      duration: img.duration
    }))
  ].sort((a, b) => a.startTime - b.startTime)
}

export function calculateAnimationProgress(item: VideoClass | ImageClass, currentTime: number, startTime: number): number {
  const elapsed = currentTime - startTime
  const duration = (item as any).startTime !== undefined ? (item as ImageClass).duration : (item as VideoClass).duration
  return (duration && duration > 0) ? Math.max(0, Math.min(1, elapsed / duration)) : 0
}

// Easing function for smoother speed transitions
function cubicBezier(t: number): number {
  return t * t * (3 - 2 * t)
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
    // Integral of 3x^2 - 2x^3 is x^3 - 0.5x^4
    const Fx = Math.pow(x, 3) - 0.5 * Math.pow(x, 4)
    return speedStart * t + (speedEnd - speedStart) * D * Fx
  }

  if (Math.abs(speedStart - speedEnd) < 0.001) {
    return t * speedStart
  }
  
  return speedStart * t + (Math.pow(t, 2) / (2 * D)) * (speedEnd - speedStart)
}

export function findActiveAndNextItems(items: MainItem[], time: number) {
  const activeIdx = items.findIndex(it => time >= it.startTime && time < it.startTime + it.duration)
  const activeItem = activeIdx !== -1 ? items[activeIdx] : null
  const nextItem = activeIdx !== -1 && activeIdx < items.length - 1 
    ? items[activeIdx + 1] 
    : (items.find(it => it.startTime > time) || null)

  // Flash transitions are centered on the cut, so during the first half of the
  // new clip we still treat the transition pair as previous -> current.
  if (activeItem && activeIdx > 0 && activeItem.item.transition === 'flash') {
    const previousItem = items[activeIdx - 1]
    const rawTransDur = Math.max(0.1, activeItem.item.transitionDuration ?? 1.0)
    const transDur = Math.min(rawTransDur, previousItem.duration, activeItem.duration)
    const halfDur = transDur * 0.5
    if (time >= activeItem.startTime && time < activeItem.startTime + halfDur) {
      return { activeItem: previousItem, nextItem: activeItem }
    }
  }
  
  return { activeItem, nextItem }
}

export function checkTransition(activeItem: MainItem | null, nextItem: MainItem | null, time: number) {
  if (!activeItem || !nextItem) return { transitionActive: false, progress: 0 }
  
  const isTransitionType = nextItem.item.transition !== 'none'
  if (!isTransitionType) return { transitionActive: false, progress: 0 }

  const rawTransDur = Math.max(0.1, nextItem.item.transitionDuration ?? 1.0)
  const transDur = Math.min(rawTransDur, activeItem.duration, nextItem.duration)
  if (nextItem.item.transition === 'flash') {
    const halfDur = transDur * 0.5
    const start = nextItem.startTime - halfDur
    const end = nextItem.startTime + halfDur
    const transitionActive = time >= start && time <= end
    const progress = transDur > 0 ? Math.max(0, Math.min(1, (time - start) / transDur)) : 1
    return { transitionActive, progress }
  }

  const timeUntilNext = nextItem.startTime - time
  const transitionActive = timeUntilNext >= 0 && timeUntilNext <= transDur
  const progress = transDur > 0 ? Math.max(0, Math.min(1, 1 - (timeUntilNext / transDur))) : 1

  return { transitionActive, progress }
}
