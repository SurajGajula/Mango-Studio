export class AudioClass {
  id: string
  name: string
  url: string
  createdAt: Date

  constructor(id: string, name: string, url: string, createdAt?: Date) {
    this.id = id
    this.name = name
    this.url = url
    this.createdAt = createdAt ?? new Date()
  }
}
