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
  
  return { activeItem, nextItem }
}

export function checkTransition(activeItem: MainItem | null, nextItem: MainItem | null, time: number) {
  if (!activeItem || !nextItem) return { transitionActive: false, progress: 0 }
  
  const isTransitionType = nextItem.item.transition !== 'none'
  if (!isTransitionType) return { transitionActive: false, progress: 0 }

  const rawTransDur = Math.max(0.1, nextItem.item.transitionDuration ?? 1.0)
  const transDur = Math.min(rawTransDur, activeItem.duration)
  const timeUntilNext = nextItem.startTime - time
  
  const transitionActive = timeUntilNext >= 0 && timeUntilNext <= transDur
  const progress = transDur > 0 ? Math.max(0, Math.min(1, 1 - (timeUntilNext / transDur))) : 1

  return { transitionActive, progress }
}
