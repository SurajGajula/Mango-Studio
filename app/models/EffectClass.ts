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

  copy(updates: Partial<EffectClass>): EffectClass {
    return new EffectClass(
      updates.id ?? this.id,
      updates.type ?? this.type,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      updates.createdAt ?? this.createdAt
    )
  }
}
