export type ZoomMode = 'none' | 'in' | 'out' | 'shake'

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
    zoom?: ZoomMode,
    cropAspect?: string,
    cropSx?: number,
    cropSy?: number,
    cropSw?: number,
    cropSh?: number,
    zoomIntensity?: number,
    row?: number
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
    this.zoom = zoom ?? 'none'
    this.zoomIntensity = zoomIntensity ?? 0.5
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
      updates.zoom ?? this.zoom,
      updates.cropAspect ?? this.cropAspect,
      updates.cropSx ?? this.cropSx,
      updates.cropSy ?? this.cropSy,
      updates.cropSw ?? this.cropSw,
      updates.cropSh ?? this.cropSh,
      updates.zoomIntensity ?? this.zoomIntensity,
      updates.row ?? this.row
    )
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
