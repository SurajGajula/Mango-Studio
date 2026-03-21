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
  playbackSpeed: number
  speedStart?: number
  speedEnd?: number
  speedEasing: 'linear' | 'ease'
  isOverlay: boolean
  row: number
  volume: number
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
    originalDuration?: number,
    playbackSpeed?: number,
    isOverlay?: boolean,
    row?: number,
    volume?: number,
    speedStart?: number,
    speedEnd?: number,
    speedEasing?: 'linear' | 'ease'
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
    this.playbackSpeed = playbackSpeed ?? 1
    this.isOverlay = isOverlay ?? false
    this.row = row ?? 0
    this.volume = volume ?? 1.0
    this.speedStart = speedStart ?? this.playbackSpeed
    this.speedEnd = speedEnd ?? this.playbackSpeed
    this.speedEasing = speedEasing ?? 'linear'
    this.createdAt = createdAt ?? new Date()
  }

  copy(updates: Partial<AudioClass>): AudioClass {
    return new AudioClass(
      updates.id ?? this.id,
      updates.name ?? this.name,
      updates.url ?? this.url,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      updates.marks ?? this.marks,
      updates.createdAt ?? this.createdAt,
      updates.trimStart ?? this.trimStart,
      updates.trimEnd ?? this.trimEnd,
      updates.originalDuration ?? this.originalDuration,
      updates.playbackSpeed ?? this.playbackSpeed,
      updates.isOverlay ?? this.isOverlay,
      updates.row ?? this.row,
      updates.volume ?? this.volume,
      updates.speedStart ?? this.speedStart,
      updates.speedEnd ?? this.speedEnd,
      updates.speedEasing ?? this.speedEasing
    )
  }
}
