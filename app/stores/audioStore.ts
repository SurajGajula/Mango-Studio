import { create } from 'zustand'
import { AudioClass } from '@/app/models/AudioClass'

interface AudioStore {
  audio: AudioClass | null
  setAudio: (audio: AudioClass) => void
  removeAudio: () => void
}

export const useAudioStore = create<AudioStore>((set) => ({
  audio: null,

  setAudio: (audio) => {
    set({ audio })
  },

  removeAudio: () => {
    set({ audio: null })
  },
}))
