import type { AudioMark } from './mediaKeyframe'
import { normalizeAudioMarks } from './mediaKeyframe'

export class AudioClass {
  id: string
  name: string
  url: string
  startTime: number
  endTime: number
  marks: AudioMark[]
  trimStart: number
  trimEnd: number
  originalDuration: number
  playbackSpeed: number
  speedStart?: number
  speedEnd?: number
  speedEasing: 'linear' | 'ease'
  row: number
  volume: number
  pitch: number
  fadeOutDuration: number
  createdAt: Date

  constructor(
    id: string,
    name: string,
    url: string,
    startTime: number,
    endTime: number,
    marks?: AudioMark[] | number[],
    createdAt?: Date,
    trimStart?: number,
    trimEnd?: number,
    originalDuration?: number,
    playbackSpeed?: number,
    row?: number,
    volume?: number,
    pitch?: number,
    fadeOutDuration?: number,
    speedStart?: number,
    speedEnd?: number,
    speedEasing?: 'linear' | 'ease'
  ) {
    this.id = id
    this.name = name
    this.url = url
    this.startTime = startTime
    this.endTime = endTime
    this.marks = normalizeAudioMarks(marks ?? [])
    this.trimStart = trimStart ?? 0
    this.trimEnd = trimEnd ?? 0
    this.originalDuration = originalDuration ?? endTime
    this.playbackSpeed = playbackSpeed ?? 1
    this.row = row ?? 0
    this.volume = volume ?? 1.0
    this.pitch = pitch ?? 1.0
    this.fadeOutDuration = fadeOutDuration ?? 0
    this.speedStart = speedStart ?? this.playbackSpeed
    this.speedEnd = speedEnd ?? this.playbackSpeed
    this.speedEasing = speedEasing ?? 'linear'
    this.createdAt = createdAt ?? new Date()
  }

  copy(updates: Partial<AudioClass>): AudioClass {
    const nextMarks = updates.marks !== undefined ? normalizeAudioMarks(updates.marks) : this.marks
    return new AudioClass(
      updates.id ?? this.id,
      updates.name ?? this.name,
      updates.url ?? this.url,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      nextMarks,
      updates.createdAt ?? this.createdAt,
      updates.trimStart ?? this.trimStart,
      updates.trimEnd ?? this.trimEnd,
      updates.originalDuration ?? this.originalDuration,
      updates.playbackSpeed ?? this.playbackSpeed,
      updates.row ?? this.row,
      updates.volume ?? this.volume,
      updates.pitch ?? this.pitch,
      updates.fadeOutDuration ?? this.fadeOutDuration,
      updates.speedStart ?? this.speedStart,
      updates.speedEnd ?? this.speedEnd,
      updates.speedEasing ?? this.speedEasing
    )
  }
}
