import { create } from 'zustand'

export interface AudioAnalysisResult {
  bpm: number
  duration: number
  beats: number[]
  quarterBeats: number[]
  drops: number[]
  choruses: { start: number; end: number }[]
  graphs: {
    waveform: number[]
    spectralFlux: number[]
    energy: number[]
    bassEnergy: number[]
  }
}

export type GraphMode = 'waveform' | 'energy' | 'spectralFlux' | 'bassEnergy'

const GRAPH_MODE_CYCLE: GraphMode[] = ['waveform', 'energy', 'spectralFlux', 'bassEnergy']

interface AudioStore {
  isAnalyzing: boolean
  analysis: AudioAnalysisResult | null
  audioUrl: string | null
  graphMode: GraphMode
  setIsAnalyzing: (v: boolean) => void
  setAnalysis: (result: AudioAnalysisResult) => void
  setAudioUrl: (url: string | null) => void
  cycleGraphMode: () => void
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  isAnalyzing: false,
  analysis: null,
  audioUrl: null,
  graphMode: 'waveform',

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  setAnalysis: (result) => set({ analysis: result, isAnalyzing: false }),

  setAudioUrl: (url) => {
    const prev = get().audioUrl
    if (prev && prev !== url) URL.revokeObjectURL(prev)
    set({ audioUrl: url })
  },

  cycleGraphMode: () => {
    const current = get().graphMode
    const idx = GRAPH_MODE_CYCLE.indexOf(current)
    const next = GRAPH_MODE_CYCLE[(idx + 1) % GRAPH_MODE_CYCLE.length]
    set({ graphMode: next })
  },
}))
