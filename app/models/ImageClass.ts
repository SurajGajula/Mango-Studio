import type { MediaKeyframe } from './mediaKeyframe'

export type AnimationMode = 'none' | 'pulse' | 'shake' | 'jitter' | 'last-frame-hold'
export type TransitionMode = 'none' | 'split' | 'fade' | 'slide-in' | 'circle' | 'rotate' | 'flash'
export type SlideTransitionEasing = 'smooth' | 'ease-in' | 'ease-out' | 'linear'

export class ImageClass {
  id: string
  name: string
  url: string
  startTime: number
  endTime: number
  x: number
  y: number
  width: number
  height: number
  opacity: number
  createdAt: Date
  isMainTrack: boolean
  animation: AnimationMode
  transition: TransitionMode
  zoomIntensity: number
  transitionDuration?: number
  animationDuration?: number
  transitionColor?: string
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom'
  transitionAxis?: 'horizontal' | 'vertical'
  transitionSlideEasing?: SlideTransitionEasing
  transitionCircleEasing?: SlideTransitionEasing
  cropAspect?: string
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  row: number
  rotation: number
  keyframes: MediaKeyframe[]

  constructor(
    id: string,
    name: string,
    url: string,
    startTime: number,
    endTime: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    opacity?: number,
    createdAt?: Date,
    isMainTrack?: boolean,
    animation?: AnimationMode,
    transition?: any,
    cropAspect?: string,
    cropSx?: number,
    cropSy?: number,
    cropSw?: number,
    cropSh?: number,
    zoomIntensity?: number,
    transitionDuration?: number,
    animationDuration?: number,
    transitionColor?: string,
    transitionDirection?: 'left' | 'right' | 'top' | 'bottom',
    transitionAxis?: 'horizontal' | 'vertical',
    transitionSlideEasing?: SlideTransitionEasing,
    transitionCircleEasing?: SlideTransitionEasing,
    row?: number,
    rotation?: number,
    keyframes?: MediaKeyframe[],
    zoom?: any
  ) {
    this.id = id
    this.name = name
    this.url = url
    this.startTime = startTime
    this.endTime = endTime
    this.x = x ?? 0
    this.y = y ?? 0
    this.width = width ?? 200
    this.height = height ?? 200
    this.opacity = opacity ?? 1
    this.createdAt = createdAt || new Date()
    this.row = row ?? 0
    this.rotation = rotation ?? 0
    this.isMainTrack = isMainTrack ?? (this.row === 0)
    
    // Migration logic
    if (animation) {
      this.animation = animation
    } else if (zoom && ['none', 'pulse', 'shake', 'jitter'].includes(zoom)) {
      this.animation = zoom as AnimationMode
    } else if (zoom === 'in' || zoom === 'out') {
      this.animation = 'pulse'
    } else {
      this.animation = 'none'
    }

    if (transition) {
      if (transition.startsWith('slide-in-')) {
        this.transition = 'slide-in'
        this.transitionDirection = transition.replace('slide-in-', '') as any
      } else if (transition === 'split-horizontal') {
        this.transition = 'split'
        this.transitionAxis = 'vertical'
      } else if (transition === 'split-vertical') {
        this.transition = 'split'
        this.transitionAxis = 'horizontal'
      } else if (transition === 'flash-white') {
        this.transition = 'flash'
        this.transitionColor = '#FFFFFF'
      } else if (transition === 'flash-black') {
        this.transition = 'flash'
        this.transitionColor = '#000000'
      } else {
        this.transition = transition as TransitionMode
      }
    } else if (zoom && ['split-horizontal', 'split-vertical', 'fade', 'circle', 'rotate', 'flash-white', 'flash-black'].includes(zoom)) {
      if (zoom === 'split-horizontal' || zoom === 'split-vertical') {
        this.transition = 'split'
        this.transitionAxis = zoom === 'split-horizontal' ? 'vertical' : 'horizontal'
      } else if (zoom === 'flash-white' || zoom === 'flash-black') {
        this.transition = 'flash'
        this.transitionColor = zoom === 'flash-white' ? '#FFFFFF' : '#000000'
      } else {
        this.transition = zoom as TransitionMode
      }
    } else {
      this.transition = 'none'
    }

    this.transitionColor = transitionColor ?? this.transitionColor ?? '#FFFFFF'
    this.transitionDirection = transitionDirection ?? this.transitionDirection ?? 'left'
    this.transitionAxis = transitionAxis ?? this.transitionAxis ?? 'horizontal'
    this.transitionSlideEasing = transitionSlideEasing ?? this.transitionSlideEasing ?? 'smooth'
    this.transitionCircleEasing = transitionCircleEasing ?? this.transitionCircleEasing ?? 'smooth'
    this.zoomIntensity = zoomIntensity !== undefined ? zoomIntensity : 0.5
    this.transitionDuration = transitionDuration
    this.animationDuration = animationDuration
    this.cropAspect = cropAspect
    this.cropSx = cropSx ?? 0
    this.cropSy = cropSy ?? 0
    this.cropSw = cropSw ?? 1
    this.cropSh = cropSh ?? 1
    this.keyframes = keyframes ?? []
  }

  copy(updates: Partial<ImageClass>): ImageClass {
    return new ImageClass(
      updates.id ?? this.id,
      updates.name ?? this.name,
      updates.url ?? this.url,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      updates.x ?? this.x,
      updates.y ?? this.y,
      updates.width ?? this.width,
      updates.height ?? this.height,
      updates.opacity ?? this.opacity,
      updates.createdAt ?? this.createdAt,
      updates.isMainTrack ?? this.isMainTrack,
      updates.animation ?? this.animation,
      updates.transition ?? this.transition,
      updates.cropAspect ?? this.cropAspect,
      updates.cropSx ?? this.cropSx,
      updates.cropSy ?? this.cropSy,
      updates.cropSw ?? this.cropSw,
      updates.cropSh ?? this.cropSh,
      updates.zoomIntensity ?? this.zoomIntensity,
      updates.transitionDuration ?? this.transitionDuration,
      updates.animationDuration ?? this.animationDuration,
      updates.transitionColor ?? this.transitionColor,
      updates.transitionDirection ?? this.transitionDirection,
      updates.transitionAxis ?? this.transitionAxis,
      updates.transitionSlideEasing ?? this.transitionSlideEasing,
      updates.transitionCircleEasing ?? this.transitionCircleEasing,
      updates.row ?? this.row,
      updates.rotation ?? this.rotation,
      updates.keyframes ?? this.keyframes,
      undefined
    )
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
