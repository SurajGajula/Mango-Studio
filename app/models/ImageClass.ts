export type AnimationMode = 'none' | 'pulse' | 'shake' | 'jitter'
export type TransitionMode = 'none' | 'split-horizontal' | 'split-vertical' | 'fade' | 'slide-in-top' | 'slide-in-bottom' | 'slide-in-left' | 'slide-in-right' | 'circle' | 'rotate'

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
  cropAspect?: string
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  row: number

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
    transition?: TransitionMode,
    cropAspect?: string,
    cropSx?: number,
    cropSy?: number,
    cropSw?: number,
    cropSh?: number,
    zoomIntensity?: number,
    transitionDuration?: number,
    animationDuration?: number,
    row?: number,
    zoom?: any // Migration field
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
      this.transition = transition
    } else if (zoom && ['split-horizontal', 'split-vertical', 'fade', 'circle'].includes(zoom)) {
      this.transition = zoom as TransitionMode
    } else {
      this.transition = 'none'
    }

    this.zoomIntensity = zoomIntensity !== undefined ? zoomIntensity : 0.5
    this.transitionDuration = transitionDuration
    this.animationDuration = animationDuration
    this.cropAspect = cropAspect
    this.cropSx = cropSx ?? 0
    this.cropSy = cropSy ?? 0
    this.cropSw = cropSw ?? 1
    this.cropSh = cropSh ?? 1
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
      updates.row ?? this.row
    )
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
