import { create } from 'zustand'
import { AudioClass } from '@/app/models/AudioClass'
import { useManifestStore } from '@/app/stores/manifestStore'

export interface AudioAnalysisResult {
  duration: number
  waveform: number[]
}

interface AudioStore {
  isAnalyzing: boolean
  analysis: AudioAnalysisResult | null
  audio: AudioClass | null
  audioUrl: string | null
  userMarks: number[]
  setIsAnalyzing: (v: boolean) => void
  setAnalysis: (result: AudioAnalysisResult) => void
  setAudio: (audio: AudioClass) => void
  removeAudio: () => void
  addUserMark: (time: number) => void
  clearUserMarks: () => void
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  isAnalyzing: false,
  analysis: null,
  audio: null,
  audioUrl: null,
  userMarks: [],

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  setAnalysis: (result) => set({ analysis: result, isAnalyzing: false }),

  setAudio: (audio) => {
    set({ audio, audioUrl: audio.url })
  },

  removeAudio: () => {
    set({ audio: null, audioUrl: null, analysis: null, isAnalyzing: false, userMarks: [] })
  },

  addUserMark: (time) => {
    const marks = get().userMarks
    if (marks.some((m) => Math.abs(m - time) < 0.05)) return
    const newMarks = [...marks, time].sort((a, b) => a - b)
    set({ userMarks: newMarks })
    const audioId = get().audio?.id
    if (audioId) useManifestStore.getState().updateAudio(audioId, { marks: newMarks })
  },

  clearUserMarks: () => {
    set({ userMarks: [] })
    const audioId = get().audio?.id
    if (audioId) useManifestStore.getState().updateAudio(audioId, { marks: [] })
  },
}))
