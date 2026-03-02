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
    prompt?: string
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
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      title: this.title,
      url: this.url,
      duration: this.duration,
      originalDuration: this.originalDuration,
      trimStart: this.trimStart,
      trimEnd: this.trimEnd,
      timestamp: this.timestamp,
      prompt: this.prompt,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    }
  }

  static fromJSON(data: {
    id: string
    title: string
    url?: string
    duration?: number
    originalDuration?: number
    trimStart?: number
    trimEnd?: number
    timestamp?: number
    prompt?: string
    createdAt?: string
    updatedAt?: string
  }): VideoClass {
    return new VideoClass(
      data.id,
      data.title,
      data.url,
      data.duration,
      data.timestamp,
      data.createdAt ? new Date(data.createdAt) : undefined,
      data.updatedAt ? new Date(data.updatedAt) : undefined,
      data.originalDuration,
      data.trimStart,
      data.trimEnd,
      data.prompt
    )
  }
}
