import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { ManifestStore, HistoryEntry, BlobEntry } from './types'

let historyPaused = false

function collectUrls(entries: BlobEntry[]): Set<string> {
  const urls = new Set<string>()
  for (const entry of entries) {
    if (!entry) continue
    for (const v of entry.videos) if (v.url) urls.add(v.url)
    for (const img of entry.images) if (img.url) urls.add(img.url)
  }
  return urls
}

function pruneUrls(
  oldHistory: BlobEntry[],
  currentHistory: BlobEntry[],
  liveVideos: VideoClass[],
  liveImages: ImageClass[]
) {
  const live: BlobEntry = { videos: liveVideos, images: liveImages }
  const recentHistory = currentHistory.slice(-5)
  const kept = collectUrls([...recentHistory, live])
  const candidates = collectUrls(oldHistory)
  
  for (const url of candidates) {
    if (!kept.has(url) && url.startsWith('blob:')) {
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

  pushHistory: () => {
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
    if (current && JSON.stringify(current) === JSON.stringify(entry)) return
    const truncated = state.history.slice(0, state.historyIndex + 1)
    const next = [...truncated, entry]
    
    const historyToKeep = next.slice(-5)
    const evictedFromHistory = next.slice(0, -5)
    if (evictedFromHistory.length > 0) {
      pruneUrls(evictedFromHistory, historyToKeep, state.videos, state.images)
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
