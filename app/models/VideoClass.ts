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
    opacity?: number
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
    this.isOverlay = isOverlay ?? false
    this.x = x ?? 0
    this.y = y ?? 0
    this.width = width ?? 480
    this.height = height ?? 270
    this.opacity = opacity ?? 1
  }
}
