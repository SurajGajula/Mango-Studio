import type { AnimationMode, TransitionMode } from './ImageClass'

export class VideoClass {
  id: string
  title: string
  url?: string
  duration?: number
  originalDuration?: number
  trimStart: number
  trimEnd: number
  timestamp: number
  prompt?: string
  createdAt: Date
  updatedAt: Date
  isOverlay: boolean
  x: number
  y: number
  width: number
  height: number
  opacity: number
  animation: AnimationMode
  transition: TransitionMode
  zoomIntensity: number
  transitionDuration?: number
  animationDuration?: number
  row: number
  muted: boolean
  cropAspect?: string
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  sourceUrl?: string
  sourceTrimStart?: number
  sourceDuration?: number
  playbackSpeed: number
  speedStart?: number
  speedEnd?: number
  speedEasing: 'linear' | 'ease'

  constructor(
    id: string,
    title: string,
    url?: string,
    duration?: number,
    timestamp?: number,
    createdAt?: Date,
    updatedAt?: Date,
    originalDuration?: number,
    trimStart?: number,
    trimEnd?: number,
    prompt?: string,
    isOverlay?: boolean,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    opacity?: number,
    animation?: AnimationMode,
    transition?: TransitionMode,
    zoomIntensity?: number,
    transitionDuration?: number,
    animationDuration?: number,
    row?: number,
    muted?: boolean,
    cropAspect?: string,
    cropSx?: number,
    cropSy?: number,
    cropSw?: number,
    cropSh?: number,
    sourceUrl?: string,
    sourceTrimStart?: number,
    sourceDuration?: number,
    playbackSpeed?: number,
    speedStart?: number,
    speedEnd?: number,
    speedEasing?: 'linear' | 'ease',
    zoom?: AnimationMode | TransitionMode // Migration field
  ) {
    this.id = id
    this.title = title
    this.url = url
    this.duration = duration
    this.originalDuration = originalDuration ?? duration
    this.trimStart = trimStart ?? 0
    this.trimEnd = trimEnd ?? 0
    this.timestamp = timestamp ?? 0
    this.prompt = prompt
    this.createdAt = createdAt || new Date()
    this.updatedAt = updatedAt || new Date()
    this.row = row ?? 0
    this.isOverlay = isOverlay ?? (this.row > 0)
    this.x = x ?? 0
    this.y = y ?? 0
    this.width = width ?? 270
    this.height = height ?? 480
    this.opacity = opacity ?? 1
    
    // Migration logic
    if (animation) {
      this.animation = animation
    } else if (zoom && ['none', 'in', 'out', 'shake', 'jitter'].includes(zoom)) {
      this.animation = zoom as AnimationMode
    } else {
      this.animation = 'none'
    }

    if (transition) {
      this.transition = transition
    } else if (zoom && ['split-horizontal', 'split-vertical'].includes(zoom)) {
      this.transition = zoom as TransitionMode
    } else {
      this.transition = 'none'
    }

    this.zoomIntensity = zoomIntensity !== undefined ? zoomIntensity : 0.5
    this.transitionDuration = transitionDuration
    this.animationDuration = animationDuration
    this.muted = muted ?? false
    this.cropAspect = cropAspect
    this.cropSx = cropSx ?? 0
    this.cropSy = cropSy ?? 0
    this.cropSw = cropSw ?? 1
    this.cropSh = cropSh ?? 1
    this.sourceUrl = sourceUrl
    this.sourceTrimStart = sourceTrimStart
    this.sourceDuration = sourceDuration
    this.playbackSpeed = playbackSpeed ?? 1
    this.speedStart = speedStart ?? this.playbackSpeed
    this.speedEnd = speedEnd ?? this.playbackSpeed
    this.speedEasing = speedEasing ?? 'linear'
  }

  copy(updates: Partial<VideoClass>): VideoClass {
    return new VideoClass(
      updates.id ?? this.id,
      updates.title ?? this.title,
      updates.url ?? this.url,
      updates.duration ?? this.duration,
      updates.timestamp ?? this.timestamp,
      updates.createdAt ?? this.createdAt,
      updates.updatedAt ?? this.updatedAt,
      updates.originalDuration ?? this.originalDuration,
      updates.trimStart ?? this.trimStart,
      updates.trimEnd ?? this.trimEnd,
      updates.prompt ?? this.prompt,
      updates.isOverlay ?? this.isOverlay,
      updates.x ?? this.x,
      updates.y ?? this.y,
      updates.width ?? this.width,
      updates.height ?? this.height,
      updates.opacity ?? this.opacity,
      updates.animation ?? this.animation,
      updates.transition ?? this.transition,
      updates.zoomIntensity ?? this.zoomIntensity,
      updates.transitionDuration ?? this.transitionDuration,
      updates.animationDuration ?? this.animationDuration,
      updates.row ?? this.row,
      updates.muted ?? this.muted,
      updates.cropAspect ?? this.cropAspect,
      updates.cropSx ?? this.cropSx,
      updates.cropSy ?? this.cropSy,
      updates.cropSw ?? this.cropSw,
      updates.cropSh ?? this.cropSh,
      updates.sourceUrl ?? this.sourceUrl,
      updates.sourceTrimStart ?? this.sourceTrimStart,
      updates.sourceDuration ?? this.sourceDuration,
      updates.playbackSpeed ?? this.playbackSpeed,
      updates.speedStart ?? this.speedStart,
      updates.speedEnd ?? this.speedEnd,
      updates.speedEasing ?? this.speedEasing
    )
  }
}
