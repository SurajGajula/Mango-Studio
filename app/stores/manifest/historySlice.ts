import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { ManifestStore, HistoryEntry } from './types'
import { forgetFileObjectUrlIfRevoked } from '@/app/lib/fileObjectUrlCache'

let historyPaused = false

function collectUrls(entries: HistoryEntry[]): Set<string> {
  const urls = new Set<string>()
  for (const entry of entries) {
    if (!entry) continue
    if (entry.videos) {
      for (const v of entry.videos) {
        if (v.url) urls.add(v.url)
        if (v.sourceUrl) urls.add(v.sourceUrl)
      }
    }
    if (entry.images) {
      for (const img of entry.images) if (img.url) urls.add(img.url)
    }
    if (entry.audios) {
      for (const a of entry.audios) if (a.url) urls.add(a.url)
    }
  }
  return urls
}

function pruneUrls(
  oldHistory: HistoryEntry[],
  currentHistory: HistoryEntry[],
  liveVideos: VideoClass[],
  liveImages: ImageClass[],
  liveAudios: AudioClass[]
) {
  const live: HistoryEntry = { videos: liveVideos, images: liveImages, audios: liveAudios, texts: [], effects: [] }
  const recentHistory = currentHistory.slice(-5)
  const kept = collectUrls([...recentHistory, live])
  const candidates = collectUrls(oldHistory)
  
  for (const url of candidates) {
    if (!kept.has(url) && url.startsWith('blob:')) {
      forgetFileObjectUrlIfRevoked(url)
      URL.revokeObjectURL(url)
    }
  }
}

const MAX_HISTORY = 50

export const createHistorySlice = (set: any, get: any) => ({
  history: [{ videos: [], images: [], texts: [], audios: [], effects: [] }],
  historyIndex: 0,

  pauseHistory: () => { historyPaused = true },
  resumeHistory: () => { historyPaused = false },

  pushHistory: (opts?: { force?: boolean }) => {
    if (historyPaused) return
    const state = get()
    const entry: HistoryEntry = {
      videos: [...state.videos],
      images: [...state.images],
      texts: [...state.texts],
      audios: [...state.audios],
      effects: [...state.effects],
    }
    const current = state.history[state.historyIndex]
    if (!opts?.force && current && JSON.stringify(current) === JSON.stringify(entry)) return
    const truncated = state.history.slice(0, state.historyIndex + 1)
    const next = [...truncated, entry]
    
    const historyToKeep = next.slice(-5)
    const evictedFromHistory = next.slice(0, -5)
    if (evictedFromHistory.length > 0) {
      pruneUrls(evictedFromHistory, historyToKeep, state.videos, state.images, state.audios)
    }

    const trimmed = next.slice(-MAX_HISTORY)
    set({ history: trimmed, historyIndex: trimmed.length - 1 })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex <= 0) return
    const target = state.history[state.historyIndex - 1]
    set({
      videos: [...target.videos],
      images: [...target.images],
      texts: [...(target.texts ?? [])],
      audios: [...(target.audios ?? [])],
      effects: [...(target.effects ?? [])],
      historyIndex: state.historyIndex - 1,
      isPlaying: false,
    })
    get().recalculateTimestamps()
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const target = state.history[state.historyIndex + 1]
    set({
      videos: [...target.videos],
      images: [...target.images],
      texts: [...(target.texts ?? [])],
      audios: [...(target.audios ?? [])],
      effects: [...(target.effects ?? [])],
      historyIndex: state.historyIndex + 1,
      isPlaying: false,
    })
    get().recalculateTimestamps()
  },
})
