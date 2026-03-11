export type EffectType = 'crt-dither'

export class EffectClass {
  id: string
  type: EffectType
  startTime: number
  endTime: number
  createdAt: Date

  constructor(
    id: string,
    type: EffectType,
    startTime: number,
    endTime: number,
    createdAt?: Date
  ) {
    this.id = id
    this.type = type
    this.startTime = startTime
    this.endTime = endTime
    this.createdAt = createdAt || new Date()
  }
}
