import type { MediaKeyframe } from './mediaKeyframe'

export type AnimationMode =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'shake'
  | 'jitter'
  | 'slide-shake-left'
  | 'slide-shake-right'
  | 'last-frame-hold'

export type AnimationZoomEasing = 'constant' | 'fast-slow' | 'slow-fast'

const LEGACY_ANIMATION: Record<string, AnimationMode> = {
  pulse: 'zoom-in',
  'zoom-fast-slow': 'zoom-in',
  'zoom-slow-fast': 'zoom-in',
  'zoom-in-fast-slow': 'zoom-in',
  'zoom-in-slow-fast': 'zoom-in',
  'zoom-out-fast-slow': 'zoom-out',
  'zoom-out-slow-fast': 'zoom-out',
}

export function migrateAnimationValue(raw: string | AnimationMode | undefined | null): AnimationMode {
  if (raw === undefined || raw === null || raw === '') return 'none'
  const s = raw as string
  if (LEGACY_ANIMATION[s]) return LEGACY_ANIMATION[s]
  const allowed: AnimationMode[] = ['none', 'zoom-in', 'zoom-out', 'shake', 'jitter', 'slide-shake-left', 'slide-shake-right', 'last-frame-hold']
  if (allowed.includes(s as AnimationMode)) return s as AnimationMode
  return 'none'
}

export function coerceAnimationZoomEasing(v: unknown): AnimationZoomEasing | undefined {
  if (v === 'constant' || v === 'slow-fast' || v === 'fast-slow') return v
  return undefined
}

export function inferAnimationZoomEasing(
  animationRaw: string,
  zoomRaw: string,
  explicit?: AnimationZoomEasing | null | unknown
): AnimationZoomEasing {
  const coerced = coerceAnimationZoomEasing(explicit)
  if (coerced) return coerced
  const combined = `${animationRaw} ${zoomRaw}`
  if (
    combined.includes('slow-fast') ||
    combined.includes('zoom-slow-fast') ||
    combined.includes('zoom-in-slow-fast') ||
    combined.includes('zoom-out-slow-fast')
  ) {
    return 'slow-fast'
  }
  return 'fast-slow'
}

export const ANIMATION_FROM_ZOOM_FIELD = new Set<string>([
  'none',
  'pulse',
  'zoom-fast-slow',
  'zoom-slow-fast',
  'zoom-in',
  'zoom-out',
  'zoom-in-fast-slow',
  'zoom-in-slow-fast',
  'zoom-out-fast-slow',
  'zoom-out-slow-fast',
  'shake',
  'jitter',
  'slide-shake-left',
  'slide-shake-right',
])

export type TransitionMode = 'none' | 'split' | 'fade' | 'morph' | 'slide-in' | 'circle' | 'rotate' | 'flash' | 'wipe'
export type SlideTransitionEasing = 'smooth' | 'ease-in' | 'ease-out' | 'linear'
export type WipeTransitionEasing = 'ease-in' | 'ease-out' | 'linear'
export type FlashTransitionMode = 'solid' | 'negative'

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
  animation: AnimationMode
  transition: TransitionMode
  zoomIntensity: number
  zoomDistanceIntensity: number
  transitionDuration?: number
  animationDuration?: number
  animationZoomEasing: AnimationZoomEasing
  transitionColor?: string
  transitionFlashMode?: FlashTransitionMode
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom' | 'up' | 'down'
  transitionAxis?: 'horizontal' | 'vertical'
  transitionSlideEasing?: SlideTransitionEasing
  transitionCircleEasing?: SlideTransitionEasing
  transitionWipeEasing?: WipeTransitionEasing
  cropAspect?: string
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  row: number
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
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
    animationZoomEasing?: AnimationZoomEasing,
    transitionColor?: string,
    transitionDirection?: 'left' | 'right' | 'top' | 'bottom' | 'up' | 'down',
    transitionAxis?: 'horizontal' | 'vertical',
    transitionSlideEasing?: SlideTransitionEasing,
    transitionCircleEasing?: SlideTransitionEasing,
    row?: number,
    rotation?: number,
    keyframes?: MediaKeyframe[],
    zoom?: any,
    transitionFlashMode?: FlashTransitionMode,
    zoomDistanceIntensity?: number,
    transitionWipeEasing?: WipeTransitionEasing,
    flipHorizontal?: boolean,
    flipVertical?: boolean
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
    this.flipHorizontal = flipHorizontal ?? false
    this.flipVertical = flipVertical ?? false

    const zoomStr = typeof zoom === 'string' ? zoom : ''
    const animStr = animation ? String(animation) : ''

    if (animation) {
      this.animation = migrateAnimationValue(animStr)
    } else if (zoomStr && ANIMATION_FROM_ZOOM_FIELD.has(zoomStr)) {
      this.animation = migrateAnimationValue(zoomStr)
    } else if (zoom === 'in' || zoom === 'out') {
      this.animation = zoom === 'out' ? 'zoom-out' : 'zoom-in'
    } else {
      this.animation = 'none'
    }

    this.animationZoomEasing = inferAnimationZoomEasing(animStr, zoomStr, animationZoomEasing)

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
    this.transitionFlashMode = transitionFlashMode ?? this.transitionFlashMode ?? 'solid'
    this.transitionDirection = transitionDirection ?? this.transitionDirection ?? 'left'
    this.transitionAxis = transitionAxis ?? this.transitionAxis ?? 'horizontal'
    this.transitionSlideEasing = transitionSlideEasing ?? this.transitionSlideEasing ?? 'smooth'
    this.transitionCircleEasing = transitionCircleEasing ?? this.transitionCircleEasing ?? 'smooth'
    this.transitionWipeEasing = transitionWipeEasing ?? this.transitionWipeEasing ?? 'linear'
    this.zoomIntensity = zoomIntensity !== undefined ? zoomIntensity : 0.5
    this.zoomDistanceIntensity = zoomDistanceIntensity !== undefined ? zoomDistanceIntensity : 1
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
      typeof updates.x === 'number' && Number.isFinite(updates.x) ? updates.x : this.x,
      typeof updates.y === 'number' && Number.isFinite(updates.y) ? updates.y : this.y,
      typeof updates.width === 'number' && Number.isFinite(updates.width) ? updates.width : this.width,
      typeof updates.height === 'number' && Number.isFinite(updates.height) ? updates.height : this.height,
      updates.opacity ?? this.opacity,
      updates.createdAt ?? this.createdAt,
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
      updates.animationZoomEasing ?? this.animationZoomEasing,
      updates.transitionColor ?? this.transitionColor,
      updates.transitionDirection ?? this.transitionDirection,
      updates.transitionAxis ?? this.transitionAxis,
      updates.transitionSlideEasing ?? this.transitionSlideEasing,
      updates.transitionCircleEasing ?? this.transitionCircleEasing,
      updates.row ?? this.row,
      updates.rotation ?? this.rotation,
      updates.keyframes ?? this.keyframes,
      undefined,
      updates.transitionFlashMode ?? this.transitionFlashMode,
      updates.zoomDistanceIntensity ?? this.zoomDistanceIntensity,
      updates.transitionWipeEasing ?? this.transitionWipeEasing,
      updates.flipHorizontal ?? this.flipHorizontal,
      updates.flipVertical ?? this.flipVertical
    )
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
