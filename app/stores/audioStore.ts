import { create } from 'zustand'
import { AudioClass } from '@/app/models/AudioClass'

interface AudioStore {
  audio: AudioClass | null
  audioUrl: string | null
  setAudio: (audio: AudioClass) => void
  removeAudio: () => void
}

export const useAudioStore = create<AudioStore>((set) => ({
  audio: null,
  audioUrl: null,

  setAudio: (audio) => {
    set({ audio, audioUrl: audio.url })
  },

  removeAudio: () => {
    set({ audio: null, audioUrl: null })
  },
}))
