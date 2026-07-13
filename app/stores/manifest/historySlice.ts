import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { TextClass } from '@/app/models/TextClass'
import { ManifestStore, HistoryEntry } from './types'
import { forgetFileObjectUrlIfRevoked } from '@/app/lib/fileObjectUrlCache'

function snapshotTexts(texts: TextClass[]): TextClass[] {
  return texts.map((t) => {
    if (typeof t.copy === 'function') return t.copy({})
    const createdAt =
      t.createdAt instanceof Date ? t.createdAt : new Date(String(t.createdAt))
    return new TextClass(
      t.id,
      t.content,
      t.startTime,
      t.endTime,
      t.x,
      t.y,
      t.width,
      t.height,
      t.opacity,
      t.fontSize,
      t.fontFamily,
      t.color,
      t.fontWeight,
      t.textAlign,
      t.animation,
      t.style,
      createdAt,
      t.row
    )
  })
}

let historyPauseDepth = 0

function collectUrls(entries: HistoryEntry[]): Set<string> {
  const urls = new Set<string>()
  for (const entry of entries) {
    if (!entry) continue
    if (entry.videos) {
      for (const v of entry.videos) {
        if (v.url) urls.add(v.url)
        if (v.sourceUrl) urls.add(v.sourceUrl)
        if (v.proxyUrl) urls.add(v.proxyUrl)
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
  droppedHistory: HistoryEntry[],
  keptHistory: HistoryEntry[],
  liveVideos: VideoClass[],
  liveImages: ImageClass[],
  liveAudios: AudioClass[]
) {
  const live: HistoryEntry = { videos: liveVideos, images: liveImages, audios: liveAudios, texts: [], effects: [] }
  const kept = collectUrls([...keptHistory, live])
  const candidates = collectUrls(droppedHistory)

  for (const url of candidates) {
    if (!kept.has(url) && url.startsWith('blob:')) {
      forgetFileObjectUrlIfRevoked(url)
      URL.revokeObjectURL(url)
    }
  }
}

const MAX_HISTORY = 30

export const createHistorySlice = (set: any, get: any) => ({
  history: [{ videos: [], images: [], texts: [], audios: [], effects: [] }],
  historyIndex: 0,

  pauseHistory: () => { historyPauseDepth++ },
  resumeHistory: () => { historyPauseDepth = Math.max(0, historyPauseDepth - 1) },

  pushHistory: (opts?: { force?: boolean }) => {
    if (historyPauseDepth > 0) return
    const state = get()
    const entry: HistoryEntry = {
      videos: [...state.videos],
      images: [...state.images],
      texts: snapshotTexts(state.texts),
      audios: [...state.audios],
      effects: [...state.effects],
    }
    const current = state.history[state.historyIndex]
    if (!opts?.force && current && JSON.stringify(current) === JSON.stringify(entry)) return
    const truncated = state.history.slice(0, state.historyIndex + 1)
    const next = [...truncated, entry]
    const trimmed = next.slice(-MAX_HISTORY)
    const dropped = next.slice(0, Math.max(0, next.length - MAX_HISTORY))
    if (dropped.length > 0) {
      pruneUrls(dropped, trimmed, state.videos, state.images, state.audios)
    }

    set({ history: trimmed, historyIndex: trimmed.length - 1 })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex <= 0) return
    const target = state.history[state.historyIndex - 1]
    set({
      videos: [...target.videos],
      images: [...target.images],
      texts: snapshotTexts(target.texts ?? []),
      audios: [...(target.audios ?? [])],
      effects: [...(target.effects ?? [])],
      historyIndex: state.historyIndex - 1,
      isPlaying: false,
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const target = state.history[state.historyIndex + 1]
    set({
      videos: [...target.videos],
      images: [...target.images],
      texts: snapshotTexts(target.texts ?? []),
      audios: [...(target.audios ?? [])],
      effects: [...(target.effects ?? [])],
      historyIndex: state.historyIndex + 1,
      isPlaying: false,
    })
  },
})
