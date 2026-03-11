export class AudioClass {
  id: string
  name: string
  url: string
  startTime: number
  endTime: number
  marks: number[]
  trimStart: number
  trimEnd: number
  originalDuration: number
  createdAt: Date

  constructor(
    id: string,
    name: string,
    url: string,
    startTime: number,
    endTime: number,
    marks?: number[],
    createdAt?: Date,
    trimStart?: number,
    trimEnd?: number,
    originalDuration?: number
  ) {
    this.id = id
    this.name = name
    this.url = url
    this.startTime = startTime
    this.endTime = endTime
    this.marks = marks ?? []
    this.trimStart = trimStart ?? 0
    this.trimEnd = trimEnd ?? 0
    this.originalDuration = originalDuration ?? endTime
    this.createdAt = createdAt ?? new Date()
  }
}
