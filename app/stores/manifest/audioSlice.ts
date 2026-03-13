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
    set((state: ManifestStore) => {
      const audio = state.audios.find((a) => a.id === id)
      if (audio?.url.startsWith('blob:')) URL.revokeObjectURL(audio.url)
      return { audios: state.audios.filter((a) => a.id !== id) }
    })
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
