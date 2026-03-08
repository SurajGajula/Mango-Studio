export class TextClass {
  id: string
  content: string
  startTime: number
  endTime: number
  x: number
  y: number
  width: number
  height: number
  opacity: number
  fontSize: number
  fontFamily: string
  color: string
  fontWeight: string
  textAlign: string
  createdAt: Date

  constructor(
    id: string,
    content: string,
    startTime: number,
    endTime: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    opacity?: number,
    fontSize?: number,
    fontFamily?: string,
    color?: string,
    fontWeight?: string,
    textAlign?: string,
    createdAt?: Date
  ) {
    this.id = id
    this.content = content
    this.startTime = startTime
    this.endTime = endTime
    this.x = x ?? 560
    this.y = y ?? 480
    this.width = width ?? 800
    this.height = height ?? 120
    this.opacity = opacity ?? 1
    this.fontSize = fontSize ?? 72
    this.fontFamily = fontFamily ?? 'Inter, sans-serif'
    this.color = color ?? '#ffffff'
    this.fontWeight = fontWeight ?? '600'
    this.textAlign = textAlign ?? 'center'
    this.createdAt = createdAt || new Date()
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
