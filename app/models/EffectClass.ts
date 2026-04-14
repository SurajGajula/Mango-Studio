export type EffectType =
  | 'crt-dither'
  | 'flashing-black-vignette'
  | 'black-and-white'
  | 'vivid-sharp'
  | 'pixel-glitch-scan'

export class EffectClass {
  id: string
  type: EffectType
  startTime: number
  endTime: number
  row: number
  intensity: number
  contrast: number
  createdAt: Date

  constructor(
    id: string,
    type: EffectType,
    startTime: number,
    endTime: number,
    row: number = 0,
    intensity: number = 0.5,
    contrast: number = 0.5,
    createdAt?: Date
  ) {
    this.id = id
    this.type = type
    this.startTime = startTime
    this.endTime = endTime
    this.row = row
    this.intensity = intensity
    this.contrast = contrast
    this.createdAt = createdAt || new Date()
  }

  copy(updates: Partial<EffectClass>): EffectClass {
    return new EffectClass(
      updates.id !== undefined ? updates.id : this.id,
      updates.type !== undefined ? updates.type : this.type,
      updates.startTime !== undefined ? updates.startTime : this.startTime,
      updates.endTime !== undefined ? updates.endTime : this.endTime,
      updates.row !== undefined ? updates.row : this.row,
      updates.intensity !== undefined ? updates.intensity : this.intensity,
      updates.contrast !== undefined ? updates.contrast : this.contrast,
      updates.createdAt !== undefined ? updates.createdAt : this.createdAt
    )
  }
}
