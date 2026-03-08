import { create } from 'zustand'
import { AudioClass } from '@/app/models/AudioClass'

export interface AnalysisParams {
  melodyFreqMin: number
  melodyFreqMax: number
  melodyFloorPct: number
  melodyStdMult: number
  melodyMinGap: number
  melodyPercGate: number
  smoothWin: number
}


export interface AudioAnalysisResult {
  bpm: number
  duration: number
  beats: number[]
  quarterBeats: number[]
  drops: number[]
  choruses: { start: number; end: number }[]
  graphPeaks: {
    drums: number[]
    bass: number[]
    melody: number[]
  }
  graphs: {
    drums: number[]
    bass: number[]
    melody: number[]
  }
}

export type GraphMode = 'drums' | 'bass' | 'melody'

const GRAPH_MODE_CYCLE: GraphMode[] = ['drums', 'bass', 'melody']

interface AudioStore {
  isAnalyzing: boolean
  analysis: AudioAnalysisResult | null
  audio: AudioClass | null
  audioUrl: string | null
  graphMode: GraphMode
  setIsAnalyzing: (v: boolean) => void
  setAnalysis: (result: AudioAnalysisResult) => void
  setAudio: (audio: AudioClass) => void
  removeAudio: () => void
  cycleGraphMode: () => void
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  isAnalyzing: false,
  analysis: null,
  audio: null,
  audioUrl: null,
  graphMode: 'drums',

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  setAnalysis: (result) => set({ analysis: result, isAnalyzing: false }),

  setAudio: (audio) => {
    const prev = get().audioUrl
    if (prev && prev !== audio.url) URL.revokeObjectURL(prev)
    set({ audio, audioUrl: audio.url })
  },

  removeAudio: () => {
    const prev = get().audioUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ audio: null, audioUrl: null, analysis: null, isAnalyzing: false })
  },

  cycleGraphMode: () => {
    const current = get().graphMode
    const idx = GRAPH_MODE_CYCLE.indexOf(current)
    const next = GRAPH_MODE_CYCLE[(idx + 1) % GRAPH_MODE_CYCLE.length]
    set({ graphMode: next })
  },
}))
