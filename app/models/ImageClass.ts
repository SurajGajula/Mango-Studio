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
    createdAt?: Date
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
  }

  get duration(): number {
    return this.endTime - this.startTime
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
      startTime: this.startTime,
      endTime: this.endTime,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      opacity: this.opacity,
      createdAt: this.createdAt.toISOString(),
    }
  }

  static fromJSON(data: {
    id: string
    name: string
    url: string
    startTime: number
    endTime: number
    x?: number
    y?: number
    width?: number
    height?: number
    opacity?: number
    createdAt?: string
  }): ImageClass {
    return new ImageClass(
      data.id,
      data.name,
      data.url,
      data.startTime,
      data.endTime,
      data.x,
      data.y,
      data.width,
      data.height,
      data.opacity,
      data.createdAt ? new Date(data.createdAt) : undefined
    )
  }
}
