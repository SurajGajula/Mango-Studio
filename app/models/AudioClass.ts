export class AudioClass {
  id: string
  name: string
  url: string
  startTime: number
  endTime: number
  marks: number[]
  createdAt: Date

  constructor(id: string, name: string, url: string, startTime: number, endTime: number, marks?: number[], createdAt?: Date) {
    this.id = id
    this.name = name
    this.url = url
    this.startTime = startTime
    this.endTime = endTime
    this.marks = marks ?? []
    this.createdAt = createdAt ?? new Date()
  }
}
