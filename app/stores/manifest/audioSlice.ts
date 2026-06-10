import { AudioClass } from '@/app/models/AudioClass'
import type { AudioMark } from '@/app/models/mediaKeyframe'
import { ManifestStore } from './types'
import { partitionAudioMarksAtSplit } from '@/app/lib/splitClipKeyframes'
import { generateId } from '@/app/lib/idUtils'

export const createAudioSlice = (set: any, get: any) => ({
  addAudio: (audio: AudioClass) => {
    set((state: ManifestStore) => ({ audios: [...state.audios, audio] }))
    get().pushHistory()
  },

  updateAudio: (id: string, updates: Partial<AudioClass>) => {
    set((state: ManifestStore) => ({
      audios: state.audios.map((a) =>
        a.id === id ? a.copy(updates) : a
      ),
    }))
    get().pushHistory()
  },

  removeAudio: (id: string) => {
    set((state: ManifestStore) => ({ audios: state.audios.filter((a) => a.id !== id) }))
    get().pushHistory()
  },

  splitAudio: (id: string, playbackTime: number) => {
    const state = get()
    const audio = state.audios.find((a: AudioClass) => a.id === id)
    if (!audio) return

    const duration = (audio.originalDuration - audio.trimStart - audio.trimEnd) / (audio.playbackSpeed ?? 1)
    const localTime = playbackTime - audio.startTime
    
    if (localTime <= 0.1 || localTime >= duration - 0.1) return

    const splitPointInOriginal = audio.trimStart + localTime * (audio.playbackSpeed ?? 1)

    const { first: marksFirst, second: marksSecond } = partitionAudioMarksAtSplit(audio.marks, splitPointInOriginal)

    const firstHalf = audio.copy({
      endTime: audio.startTime + localTime,
      trimEnd: audio.originalDuration - splitPointInOriginal,
      marks: marksFirst,
    })

    const secondHalf = audio.copy({
      id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: audio.startTime + localTime,
      endTime: audio.endTime,
      trimStart: splitPointInOriginal,
      createdAt: new Date(),
      marks: marksSecond,
    })

    set((s: ManifestStore) => ({
      audios: s.audios.map((a) => (a.id === id ? firstHalf : a)).concat([secondHalf])
    }))
    get().pushHistory()
  },

  splitAudioAtTimes: (id: string, times: number[]) => {
    const state = get()
    const audio = state.audios.find((a: AudioClass) => a.id === id)
    if (!audio) return

    const epsilon = 1e-6
    const speed = audio.playbackSpeed ?? 1
    const sourceEnd = audio.originalDuration - audio.trimEnd
    const validTimes = times
      .filter((t) => t > audio.startTime + epsilon && t < audio.endTime - epsilon)
      .sort((a, b) => a - b)
      .filter((t, i, arr) => i === 0 || t - arr[i - 1] > epsilon)

    if (validTimes.length === 0) return

    const timelineBoundaries = [audio.startTime, ...validTimes, audio.endTime]
    const sourceBoundaries = timelineBoundaries.map((t, i) => {
      if (i === 0) return audio.trimStart
      if (i === timelineBoundaries.length - 1) return sourceEnd
      return audio.trimStart + (t - audio.startTime) * speed
    })

    const newSegments: AudioClass[] = timelineBoundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = timelineBoundaries[i + 1]
      const segSourceStart = sourceBoundaries[i]
      const segSourceEnd = sourceBoundaries[i + 1]
      const isLast = i === timelineBoundaries.length - 2
      const segMarks = audio.marks
        .filter((m: AudioMark) => m.t >= segSourceStart && (isLast ? m.t <= segSourceEnd : m.t < segSourceEnd))
        .map((m: AudioMark) => (i === 0 ? m : { ...m, id: generateId('amark') }))

      return audio.copy({
        id: i === 0 ? audio.id : generateId('audio'),
        startTime: segStart,
        endTime: segEnd,
        trimStart: segSourceStart,
        trimEnd: audio.originalDuration - segSourceEnd,
        createdAt: i === 0 ? audio.createdAt : new Date(),
        marks: segMarks,
      })
    })

    set((s: ManifestStore) => ({
      audios: s.audios.filter((a) => a.id !== id).concat(newSegments),
    }))
    get().pushHistory()
  },

  trimAudio: (id: string, trimStart: number, trimEnd: number, startTime?: number) => {
    const state = get()
    const audio = state.audios.find((a: AudioClass) => a.id === id)
    if (!audio) return
    const origDuration = audio.originalDuration
    const clampedTrimStart = Math.max(0, Math.min(trimStart, origDuration - 0.1))
    const clampedTrimEnd = Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    const newStartTime = startTime !== undefined ? Math.max(0, startTime) : audio.startTime
    const sourceDuration = origDuration - clampedTrimStart - clampedTrimEnd
    const newEndTime = newStartTime + (sourceDuration / (audio.playbackSpeed ?? 1))
    
    set((s: ManifestStore) => ({
      audios: s.audios.map((a) =>
        a.id !== id ? a : a.copy({
          startTime: newStartTime,
          endTime: newEndTime,
          trimStart: clampedTrimStart,
          trimEnd: clampedTrimEnd
        })
      ),
    }))
    get().pushHistory()
  },
})
