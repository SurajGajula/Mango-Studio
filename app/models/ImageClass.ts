export type ZoomMode = 'none' | 'in' | 'out'

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
  zoom: ZoomMode
  zoomIntensity: number
  cropAspect?: string
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number

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
    zoom?: ZoomMode,
    cropAspect?: string,
    cropSx?: number,
    cropSy?: number,
    cropSw?: number,
    cropSh?: number,
    zoomIntensity?: number
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
    this.isMainTrack = isMainTrack ?? false
    this.zoom = zoom ?? 'none'
    this.zoomIntensity = zoomIntensity ?? 0.15
    this.cropAspect = cropAspect
    this.cropSx = cropSx ?? 0
    this.cropSy = cropSy ?? 0
    this.cropSw = cropSw ?? 1
    this.cropSh = cropSh ?? 1
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
