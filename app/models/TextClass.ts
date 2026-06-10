export type TextAnimation = 'none' | 'keyboard' | 'speech' | 'shake'
export type TextStyle = 'normal' | 'negative' | 'highlight'

export interface TextWordTiming {
  text: string
  startTime: number
  endTime: number
}

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
  animation: TextAnimation
  style: TextStyle
  wordTimings?: TextWordTiming[]
  createdAt: Date
  row: number

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
    animation?: TextAnimation,
    style?: TextStyle,
    createdAt?: Date,
    row?: number,
    wordTimings?: TextWordTiming[]
  ) {
    this.id = id
    this.content = content
    this.startTime = startTime
    this.endTime = endTime
    this.x = x ?? 140
    this.y = y ?? 497
    this.width = width ?? 800
    this.height = height ?? 120
    this.opacity = opacity ?? 1
    this.fontSize = fontSize ?? 96
    this.fontFamily = fontFamily ?? 'Inter, sans-serif'
    this.color = color ?? '#ffffff'
    this.fontWeight = fontWeight ?? '600'
    this.textAlign = textAlign ?? 'center'
    this.animation = animation ?? 'none'
    this.style = style ?? 'normal'
    this.createdAt = createdAt || new Date()
    this.row = row ?? 0
    this.wordTimings = wordTimings
  }

  copy(updates: Partial<TextClass>): TextClass {
    return new TextClass(
      updates.id ?? this.id,
      updates.content ?? this.content,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      updates.x ?? this.x,
      updates.y ?? this.y,
      updates.width ?? this.width,
      updates.height ?? this.height,
      updates.opacity ?? this.opacity,
      updates.fontSize ?? this.fontSize,
      updates.fontFamily ?? this.fontFamily,
      updates.color ?? this.color,
      updates.fontWeight ?? this.fontWeight,
      updates.textAlign ?? this.textAlign,
      updates.animation ?? this.animation,
      updates.style ?? this.style,
      updates.createdAt ?? this.createdAt,
      updates.row ?? this.row,
      updates.wordTimings !== undefined ? updates.wordTimings : this.wordTimings
    )
  }

  get duration(): number {
    return this.endTime - this.startTime
  }
}
