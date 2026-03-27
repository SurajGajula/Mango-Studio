import { AudioClass } from '@/app/models/AudioClass'
import { ManifestStore } from './types'

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

    const firstHalf = audio.copy({
      endTime: audio.startTime + localTime,
      trimEnd: audio.originalDuration - splitPointInOriginal
    })

    const secondHalf = audio.copy({
      id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: audio.startTime + localTime,
      endTime: audio.endTime,
      trimStart: splitPointInOriginal,
      createdAt: new Date()
    })

    set((s: ManifestStore) => ({
      audios: s.audios.map((a) => (a.id === id ? firstHalf : a)).concat([secondHalf])
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
