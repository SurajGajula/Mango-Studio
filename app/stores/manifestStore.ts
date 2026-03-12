import { create } from 'zustand'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { useSelectionStore } from '@/app/stores/selectionStore'

export type AspectRatio = '16:9' | '9:16'

interface HistoryEntry {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  effects: EffectClass[]
}

const MAX_HISTORY = 50

interface ManifestStore {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  pendingPrompt: string | null
  playbackTime: number
  isPlaying: boolean
  aspectRatio: AspectRatio
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: () => void
  pauseHistory: () => void
  resumeHistory: () => void
  undo: () => void
  redo: () => void
  addVideo: (video: VideoClass) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  removeVideo: (id: string) => void
  trimVideo: (id: string, trimStart: number, trimEnd: number, newTimestamp?: number) => void
  splitVideo: (id: string, playbackTime: number) => void
  splitImage: (id: string, playbackTime: number) => void
  recalculateTimestamps: () => void
  getTotalDuration: () => number
  setPendingPrompt: (prompt: string | null) => void
  playbackRate: number
  setPlaybackTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setPlaybackRate: (rate: number) => void
  setAspectRatio: (ratio: AspectRatio) => void
  addImage: (image: ImageClass) => void
  removeImage: (id: string) => void
  updateImage: (id: string, updates: Partial<ImageClass>) => void
  replaceImageSource: (id: string, newUrl: string, newName: string) => void
  replaceImageWithVideo: (
    imageId: string,
    video: VideoClass
  ) => void
  replaceVideoSource: (id: string, newUrl: string, newTitle: string) => void
  replaceVideoWithImage: (
    videoId: string,
    image: ImageClass
  ) => void
  bulkUpdateMainTrackItems: (
    imagePatches: Array<{ id: string; startTime?: number; endTime?: number }>,
    videoTimestampPatches: Array<{ id: string; timestamp: number }>
  ) => void
  addText: (text: TextClass) => void
  updateText: (id: string, updates: Partial<TextClass>) => void
  removeText: (id: string) => void
  splitText: (id: string, playbackTime: number) => void
  addAudio: (audio: AudioClass) => void
  updateAudio: (id: string, updates: Partial<AudioClass>) => void
  removeAudio: (id: string) => void
  trimAudio: (id: string, trimStart: number, trimEnd: number, startTime?: number) => void
  splitVideoAtTimes: (id: string, times: number[]) => void
  splitImageAtTimes: (id: string, times: number[]) => void
  duplicateItem: (id: string) => void
  effects: EffectClass[]
  addEffect: (effect: EffectClass) => void
  updateEffect: (id: string, updates: Partial<EffectClass>) => void
  removeEffect: (id: string) => void
  removeAllEffects: () => void
}

type BlobEntry = { videos: VideoClass[]; images: ImageClass[] }

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
  // Only keep URLs if they are in live state or the LAST 5 entries of history
  const recentHistory = currentHistory.slice(-5)
  const kept = collectUrls([...recentHistory, live])
  const candidates = collectUrls(oldHistory)
  
  for (const url of candidates) {
    if (!kept.has(url) && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }
}

let historyPaused = false

export const useManifestStore = create<ManifestStore>((set, get) => ({
  videos: [],
  images: [],
  texts: [],
  audios: [],
  effects: [],
  pendingPrompt: null,
  playbackTime: 0,
  isPlaying: false,
  playbackRate: 1,
  aspectRatio: '16:9',
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
    
    // Aggressive pruning: Keep blob URLs only for live state and last 5 history entries
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

  addVideo: (video: VideoClass) => {
    const state = get()
    const isMainTrack = video.row === 0
    const delta = video.duration ?? 0

    useSelectionStore.getState().setSelectedVideoId(video.id)
    set((state) => ({
      videos: [...state.videos.map(v => {
        if (isMainTrack && v.row === 0 && v.timestamp >= video.timestamp) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted,
            v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
          )
        }
        return v
      }), video],
      images: state.images.map(img => {
        if (isMainTrack && img.row === 0 && img.startTime >= video.timestamp) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + delta, img.endTime + delta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      }),
      playbackTime: video.timestamp ?? 0,
      isPlaying: false,
    }))
    get().pushHistory()
  },

  removeVideo: (id: string) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video) return

    const { selectedVideoId, setSelectedVideoId } = useSelectionStore.getState()
    if (selectedVideoId === id) setSelectedVideoId(null)

    const isMainTrack = video.row === 0
    const delta = -(video.duration ?? 0)

    set((s) => ({
      videos: s.videos
        .filter((v) => v.id !== id)
        .map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted,
            v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
          )
        }
          return v
        }),
      images: s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + delta, img.endTime + delta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      })
    }))
    get().recalculateTimestamps()
    get().pushHistory()
    const nextState = get()
    pruneUrls(
      [{ videos: state.videos, images: state.images }],
      get().history,
      nextState.videos,
      nextState.images
    )
  },

  updateVideo: (id: string, updates: Partial<VideoClass>) => {
    set((state) => ({
      videos: state.videos.map((video) => {
        if (video.id !== id) return video
        const newDuration = updates.duration ?? video.duration
        const newOrigDuration = updates.originalDuration ?? video.originalDuration ?? newDuration
        return new VideoClass(
          video.id,
          updates.title ?? video.title,
          updates.url ?? video.url,
          newDuration,
          updates.timestamp ?? video.timestamp,
          video.createdAt,
          new Date(),
          newOrigDuration,
          updates.trimStart ?? video.trimStart,
          updates.trimEnd ?? video.trimEnd,
          updates.prompt ?? video.prompt,
          updates.isOverlay ?? video.isOverlay,
          updates.x ?? video.x,
          updates.y ?? video.y,
          updates.width ?? video.width,
          updates.height ?? video.height,
          updates.opacity ?? video.opacity,
          updates.zoom ?? video.zoom,
          updates.zoomIntensity ?? video.zoomIntensity,
          updates.row ?? video.row,
          updates.muted ?? video.muted,
          updates.cropAspect ?? video.cropAspect,
          updates.cropSx ?? video.cropSx,
          updates.cropSy ?? video.cropSy,
          updates.cropSw ?? video.cropSw,
          updates.cropSh ?? video.cropSh
        )
      }),
    }))
    get().pushHistory()
  },

  trimVideo: (id: string, trimStart: number, trimEnd: number, newTimestamp?: number) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const clampedTrimStart = Math.max(0, Math.min(trimStart, origDuration - 0.1))
    const clampedTrimEnd = Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    const newDuration = origDuration - clampedTrimStart - clampedTrimEnd
    const finalTimestamp = newTimestamp !== undefined ? newTimestamp : video.timestamp

    const isMainTrack = video.row === 0
    const oldDuration = video.duration ?? 0
    const durationDelta = newDuration - oldDuration
    const timestampDelta = finalTimestamp - video.timestamp
    const totalDelta = durationDelta + timestampDelta

    set((state) => {
      const nextVideos = state.videos.map((v) => {
        if (v.id === id) {
          return new VideoClass(
            v.id, v.title, v.url, newDuration, finalTimestamp,
            v.createdAt, new Date(), origDuration, clampedTrimStart, clampedTrimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted
          )
        }
        // If on main track, shift items that start AFTER this one
        if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + totalDelta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted
          )
        }
        return v
      })

      const nextImages = state.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + totalDelta, img.endTime + totalDelta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      })

      return { videos: nextVideos, images: nextImages }
    })

    get().recalculateTimestamps()
  },

  splitVideo: (id: string, playbackTime: number) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video || video.isOverlay) return

    const localTime = playbackTime - video.timestamp
    const duration = video.duration ?? 0
    if (localTime <= 0.05 || localTime >= duration - 0.05) return

    const origDuration = video.originalDuration ?? duration
    const originalSplitPoint = video.trimStart + localTime

    const firstHalf = new VideoClass(
      video.id,
      video.title,
      video.url,
      localTime,
      video.timestamp,
      video.createdAt,
      new Date(),
      origDuration,
      video.trimStart,
      origDuration - originalSplitPoint,
      video.prompt,
      video.isOverlay,
      video.x,
      video.y,
      video.width,
      video.height,
      video.opacity,
      video.zoom,
      video.zoomIntensity,
      video.row,
      video.muted,
      video.cropAspect,
      video.cropSx,
      video.cropSy,
      video.cropSw,
      video.cropSh
    )

    const secondHalf = new VideoClass(
      `video-${Date.now()}`,
      video.title,
      video.url,
      duration - localTime,
      video.timestamp + localTime,
      new Date(),
      new Date(),
      origDuration,
      originalSplitPoint,
      video.trimEnd,
      video.prompt,
      video.isOverlay,
      video.x,
      video.y,
      video.width,
      video.height,
      video.opacity,
      video.zoom,
      video.zoomIntensity,
      video.row,
      video.muted,
      video.cropAspect,
      video.cropSx,
      video.cropSy,
      video.cropSw,
      video.cropSh
    )

    useSelectionStore.getState().setSelectedVideoId(secondHalf.id)
    set((state) => ({
      videos: state.videos
        .map((v) => (v.id === id ? firstHalf : v))
        .concat([secondHalf]),
    }))

    get().recalculateTimestamps()
    set({ playbackTime: video.timestamp + localTime })
    get().pushHistory()
  },

  splitImage: (id: string, playbackTime: number) => {
    const state = get()
    const image = state.images.find((img) => img.id === id)
    if (!image || !image.isMainTrack) return

    if (playbackTime <= image.startTime + 0.05 || playbackTime >= image.endTime - 0.05) return

    const firstHalf = new ImageClass(
      image.id,
      image.name,
      image.url,
      image.startTime,
      playbackTime,
      image.x,
      image.y,
      image.width,
      image.height,
      image.opacity,
      image.createdAt,
      image.isMainTrack,
      image.zoom,
      image.cropAspect,
      image.cropSx,
      image.cropSy,
      image.cropSw,
      image.cropSh,
      image.zoomIntensity,
      image.row
    )

    const secondHalf = new ImageClass(
      `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      image.name,
      image.url,
      playbackTime,
      image.endTime,
      image.x,
      image.y,
      image.width,
      image.height,
      image.opacity,
      new Date(),
      image.isMainTrack,
      image.zoom,
      image.cropAspect,
      image.cropSx,
      image.cropSy,
      image.cropSw,
      image.cropSh,
      image.zoomIntensity,
      image.row
    )

    useSelectionStore.getState().setSelectedImageId(secondHalf.id)
    set((state) => ({
      images: state.images
        .map((img) => (img.id === id ? firstHalf : img))
        .concat([secondHalf]),
    }))
    set({ playbackTime })
    get().pushHistory()
  },

  recalculateTimestamps: () => {
    // Videos are now positioned explicitly; no sequential recalculation needed.
  },

  getTotalDuration: () => {
    const videoEnd = get().videos
      .filter((v) => !v.isOverlay)
      .reduce((max, v) => Math.max(max, (v.timestamp ?? 0) + (v.duration ?? 0)), 0)
    const imageEnd = get().images
      .filter((img) => img.isMainTrack)
      .reduce((max, img) => Math.max(max, img.endTime), 0)
    return Math.max(videoEnd, imageEnd)
  },

  setPendingPrompt: (prompt: string | null) => {
    set({ pendingPrompt: prompt })
  },

  setPlaybackTime: (time: number) => {
    set({ playbackTime: Math.max(0, time) })
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing })
  },

  setPlaybackRate: (rate: number) => {
    set({ playbackRate: rate })
  },

  setAspectRatio: (ratio: AspectRatio) => {
    const state = get()
    if (state.videos.length === 0) {
      set({ aspectRatio: ratio })
    }
  },

  addImage: (image: ImageClass) => {
    const isMainTrack = image.row === 0
    const delta = image.duration

    useSelectionStore.getState().setSelectedImageId(image.id)
    set((state) => ({
      images: [...state.images.map(img => {
        if (isMainTrack && img.row === 0 && img.startTime >= image.startTime) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + delta, img.endTime + delta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      }), image],
      videos: state.videos.map(v => {
        if (isMainTrack && v.row === 0 && v.timestamp >= image.startTime) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted,
            v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
          )
        }
        return v
      }),
    }))
    get().pushHistory()
  },

  removeImage: (id: string) => {
    const state = get()
    const image = state.images.find((img) => img.id === id)
    if (!image) return

    const { selectedImageId, setSelectedImageId } = useSelectionStore.getState()
    if (selectedImageId === id) setSelectedImageId(null)

    const isMainTrack = image.row === 0
    const delta = -(image.duration)

    set((s) => ({
      images: s.images
        .filter((o) => o.id !== id)
        .map((img) => {
          if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
            return new ImageClass(
              img.id, img.name, img.url,
              img.startTime + delta, img.endTime + delta,
              img.x, img.y, img.width, img.height, img.opacity,
              img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
              img.cropSx, img.cropSy, img.cropSw, img.cropSh,
              img.zoomIntensity, img.row
            )
          }
          return img
        }),
      videos: s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted
          )
        }
        return v
      })
    }))
    get().pushHistory()
    const nextState = get()
    pruneUrls(
      [{ videos: state.videos, images: state.images }],
      get().history,
      nextState.videos,
      nextState.images
    )
  },

  updateImage: (id: string, updates: Partial<ImageClass>) => {
    const state = get()
    const image = state.images.find((img) => img.id === id)
    if (!image) return

    const isMainTrack = image.row === 0
    const oldDuration = image.duration
    const newDuration = updates.endTime !== undefined && updates.startTime !== undefined 
      ? updates.endTime - updates.startTime 
      : (updates.endTime !== undefined ? updates.endTime - image.startTime : (updates.startTime !== undefined ? image.endTime - updates.startTime : image.duration))
    
    const durationDelta = newDuration - oldDuration
    const timestampDelta = (updates.startTime ?? image.startTime) - image.startTime
    const totalDelta = durationDelta + timestampDelta

    set((state) => ({
      images: state.images.map((img) => {
        if (img.id === id) {
          return new ImageClass(
            img.id, updates.name ?? img.name, updates.url ?? img.url,
            updates.startTime ?? img.startTime, updates.endTime ?? img.endTime,
            updates.x ?? img.x, updates.y ?? img.y, updates.width ?? img.width, updates.height ?? img.height,
            updates.opacity ?? img.opacity, img.createdAt, updates.isMainTrack ?? img.isMainTrack,
            updates.zoom ?? img.zoom, 'cropAspect' in updates ? updates.cropAspect : img.cropAspect,
            updates.cropSx ?? img.cropSx, updates.cropSy ?? img.cropSy, updates.cropSw ?? img.cropSw, updates.cropSh ?? img.cropSh,
            updates.zoomIntensity ?? img.zoomIntensity, updates.row ?? img.row
          )
        }
        if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + totalDelta, img.endTime + totalDelta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      }),
      videos: state.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + totalDelta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted
          )
        }
        return v
      })
    }))
    get().pushHistory()
  },

  replaceImageSource: (id, newUrl, newName) => {
    const state = get()
    const image = state.images.find((img) => img.id === id)
    if (!image) return
    const oldUrl = image.url
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id
          ? new ImageClass(
              img.id, newName, newUrl,
              img.startTime, img.endTime,
              img.x, img.y, img.width, img.height, img.opacity,
              img.createdAt, img.isMainTrack,
              img.zoom, img.cropAspect, img.cropSx, img.cropSy, img.cropSw, img.cropSh,
              img.zoomIntensity, img.row
            )
          : img
      ),
    }))
    get().pushHistory()
  },

  replaceImageWithVideo: (imageId, video) => {
    const state = get()
    const image = state.images.find((img) => img.id === imageId)
    if (!image) return

    const isMainTrack = image.row === 0
    const delta = (video.duration ?? 0) - image.duration

    set((s) => ({
      images: s.images
        .filter((img) => img.id !== imageId)
        .map((img) => {
          if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
            return new ImageClass(
              img.id, img.name, img.url,
              img.startTime + delta, img.endTime + delta,
              img.x, img.y, img.width, img.height, img.opacity,
              img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
              img.cropSx, img.cropSy, img.cropSw, img.cropSh,
              img.zoomIntensity, img.row
            )
          }
          return img
        }),
      videos: [...s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted
          )
        }
        return v
      }), video],
    }))

    if (image.url.startsWith('blob:')) {
      // Manual revocation removed; pushHistory's pruneUrls will handle it
    }

    useSelectionStore.getState().setSelectedVideoId(video.id)
    get().pushHistory()
  },

  replaceVideoWithImage: (videoId, image) => {
    const state = get()
    const video = state.videos.find((v) => v.id === videoId)
    if (!video) return

    const isMainTrack = video.row === 0
    const delta = image.duration - (video.duration ?? 0)

    set((s) => ({
      videos: s.videos
        .filter((v) => v.id !== videoId)
        .map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + delta,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted,
            v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
          )
        }
          return v
        }),
      images: [...s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return new ImageClass(
            img.id, img.name, img.url,
            img.startTime + delta, img.endTime + delta,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      }), image],
    }))

    if (video.url?.startsWith('blob:')) {
      // Manual revocation removed; pushHistory's pruneUrls will handle it
    }

    useSelectionStore.getState().setSelectedImageId(image.id)
    get().pushHistory()
  },

  replaceVideoSource: (id, newUrl, newTitle) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video) return
    set((s) => ({
      videos: s.videos.map((v) =>
        v.id === id
          ? new VideoClass(
              v.id, newTitle, newUrl,
              v.duration, v.timestamp,
              v.createdAt, new Date(), v.originalDuration,
              v.trimStart, v.trimEnd, v.prompt,
              v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
              v.zoom, v.zoomIntensity, v.row, v.muted,
              v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
            )
          : v
      ),
    }))
    get().pushHistory()
  },

  bulkUpdateMainTrackItems: (imagePatches, videoTimestampPatches) => {
    const imgMap = new Map(imagePatches.map((p) => [p.id, p]))
    const vidMap = new Map(videoTimestampPatches.map((p) => [p.id, p]))
    set((state) => ({
      images: state.images.map((img) => {
        const patch = imgMap.get(img.id)
        if (!patch) return img
        return new ImageClass(
          img.id, img.name, img.url,
          patch.startTime ?? img.startTime,
          patch.endTime ?? img.endTime,
          img.x, img.y, img.width, img.height, img.opacity,
          img.createdAt, img.isMainTrack,
          img.zoom, img.cropAspect, img.cropSx, img.cropSy, img.cropSw, img.cropSh,
          img.zoomIntensity, img.row
        )
      }),
      videos: state.videos.map((v) => {
        const patch = vidMap.get(v.id)
        if (!patch) return v
        return new VideoClass(
          v.id, v.title, v.url, v.duration, patch.timestamp,
          v.createdAt, v.updatedAt, v.originalDuration,
          v.trimStart, v.trimEnd, v.prompt,
          v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
          v.zoom, v.zoomIntensity, v.row, v.muted,
          v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
        )
      }),
    }))
  },

  addText: (text: TextClass) => {
    useSelectionStore.getState().setSelectedTextId(text.id)
    set((state) => ({ texts: [...state.texts, text] }))
    get().pushHistory()
  },

  updateText: (id: string, updates: Partial<TextClass>) => {
    set((state) => ({
      texts: state.texts.map((t) =>
        t.id === id
          ? new TextClass(
              t.id,
              updates.content ?? t.content,
              updates.startTime ?? t.startTime,
              updates.endTime ?? t.endTime,
              updates.x ?? t.x,
              updates.y ?? t.y,
              updates.width ?? t.width,
              updates.height ?? t.height,
              updates.opacity ?? t.opacity,
              updates.fontSize ?? t.fontSize,
              updates.fontFamily ?? t.fontFamily,
              updates.color ?? t.color,
              updates.fontWeight ?? t.fontWeight,
              updates.textAlign ?? t.textAlign,
              updates.animation ?? t.animation,
              t.createdAt,
              updates.row ?? t.row
            )
          : t
      ),
    }))
  },

  removeText: (id: string) => {
    const { selectedTextId, setSelectedTextId } = useSelectionStore.getState()
    if (selectedTextId === id) setSelectedTextId(null)
    set((s) => ({ texts: s.texts.filter((t) => t.id !== id) }))
    get().pushHistory()
  },

  splitText: (id: string, playbackTime: number) => {
    const state = get()
    const text = state.texts.find((t) => t.id === id)
    if (!text) return
    if (playbackTime <= text.startTime + 0.05 || playbackTime >= text.endTime - 0.05) return

    const firstHalf = new TextClass(
      text.id, text.content, text.startTime, playbackTime,
      text.x, text.y, text.width, text.height, text.opacity,
      text.fontSize, text.fontFamily, text.color, text.fontWeight, text.textAlign,
      text.animation, text.createdAt, text.row
    )
    const secondHalf = new TextClass(
      `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text.content, playbackTime, text.endTime,
      text.x, text.y, text.width, text.height, text.opacity,
      text.fontSize, text.fontFamily, text.color, text.fontWeight, text.textAlign,
      text.animation, new Date(), text.row
    )

    useSelectionStore.getState().setSelectedTextId(secondHalf.id)
    set((s) => ({
      texts: s.texts.map((t) => (t.id === id ? firstHalf : t)).concat([secondHalf]),
    }))
    set({ playbackTime })
    get().pushHistory()
  },

  addAudio: (audio: AudioClass) => {
    set((state) => ({ audios: [...state.audios, audio] }))
  },

  updateAudio: (id: string, updates: Partial<AudioClass>) => {
    set((state) => ({
      audios: state.audios.map((a) =>
        a.id === id
          ? new AudioClass(
              a.id,
              updates.name ?? a.name,
              updates.url ?? a.url,
              updates.startTime ?? a.startTime,
              updates.endTime ?? a.endTime,
              updates.marks ?? a.marks,
              a.createdAt,
              updates.trimStart ?? a.trimStart,
              updates.trimEnd ?? a.trimEnd,
              updates.originalDuration ?? a.originalDuration
            )
          : a
      ),
    }))
  },

  removeAudio: (id: string) => {
    set((state) => {
      const audio = state.audios.find((a) => a.id === id)
      if (audio?.url.startsWith('blob:')) URL.revokeObjectURL(audio.url)
      return { audios: state.audios.filter((a) => a.id !== id) }
    })
  },

  trimAudio: (id: string, trimStart: number, trimEnd: number, startTime?: number) => {
    const state = get()
    const audio = state.audios.find((a) => a.id === id)
    if (!audio) return
    const origDuration = audio.originalDuration
    const clampedTrimStart = Math.max(0, Math.min(trimStart, origDuration - 0.1))
    const clampedTrimEnd = Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    const newStartTime = startTime !== undefined ? Math.max(0, startTime) : audio.startTime
    set((s) => ({
      audios: s.audios.map((a) =>
        a.id !== id ? a : new AudioClass(
          a.id, a.name, a.url,
          newStartTime, a.endTime,
          a.marks, a.createdAt,
          clampedTrimStart, clampedTrimEnd, origDuration
        )
      ),
    }))
  },

  splitVideoAtTimes: (id: string, times: number[]) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video || video.isOverlay) return

    const duration = video.duration ?? 0
    const origDuration = video.originalDuration ?? duration

    const relTimes = times
      .map((t) => t - video.timestamp)
      .filter((t) => t > 0.05 && t < duration - 0.05)
      .sort((a, b) => a - b)

    if (relTimes.length === 0) return

    const boundaries = [0, ...relTimes, duration]
    const newClips: VideoClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      return new VideoClass(
        i === 0 ? video.id : `video-${Date.now()}-${i}`,
        video.title,
        video.url,
        segEnd - segStart,
        video.timestamp + segStart,
        i === 0 ? video.createdAt : new Date(),
        new Date(),
        origDuration,
        video.trimStart + segStart,
        Math.max(0, origDuration - (video.trimStart + segEnd)),
        video.prompt,
        video.isOverlay,
        video.x,
        video.y,
        video.width,
        video.height,
        video.opacity,
        video.zoom,
        video.zoomIntensity,
        video.row,
        video.muted,
        video.cropAspect,
        video.cropSx,
        video.cropSy,
        video.cropSw,
        video.cropSh
      )
    })

    set((s) => ({
      videos: s.videos.filter((v) => v.id !== id).concat(newClips),
    }))
    get().recalculateTimestamps()
    get().pushHistory()
  },

  splitImageAtTimes: (id: string, times: number[]) => {
    const state = get()
    const image = state.images.find((img) => img.id === id)
    if (!image) return

    const validTimes = times
      .filter((t) => t > image.startTime + 0.05 && t < image.endTime - 0.05)
      .sort((a, b) => a - b)

    if (validTimes.length === 0) return

    const boundaries = [image.startTime, ...validTimes, image.endTime]
    const newSegments: ImageClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      return new ImageClass(
        i === 0 ? image.id : `image-${Date.now()}-${i}`,
        image.name,
        image.url,
        segStart,
        segEnd,
        image.x,
        image.y,
        image.width,
        image.height,
        image.opacity,
        i === 0 ? image.createdAt : new Date(),
        image.isMainTrack,
        image.zoom,
        image.cropAspect,
        image.cropSx,
        image.cropSy,
        image.cropSw,
        image.cropSh,
        image.zoomIntensity,
        image.row
      )
    })

    set((s) => ({
      images: s.images.filter((img) => img.id !== id).concat(newSegments),
    }))
    get().pushHistory()
  },

  duplicateItem: (id: string) => {
    const state = get()
    let item: VideoClass | ImageClass | TextClass | undefined
    let type: 'video' | 'image' | 'text' = 'video'

    const vMatch = state.videos.find((v) => v.id === id)
    if (vMatch) {
      item = vMatch
      type = 'video'
    } else {
      const imgMatch = state.images.find((img) => img.id === id)
      if (imgMatch) {
        item = imgMatch
        type = 'image'
      } else {
        const tMatch = state.texts.find((t) => t.id === id)
        if (tMatch) {
          item = tMatch
          type = 'text'
        }
      }
    }

    if (!item) return

    const isMainTrack = (item as any).row === 0 || (type === 'image' && (item as ImageClass).isMainTrack)
    const startTime = type === 'video' ? (item as VideoClass).timestamp : (item as any).startTime
    const duration = (item as any).duration ?? 0
    const endTime = startTime + duration

    let newItem: VideoClass | ImageClass | TextClass
    const newId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    if (type === 'video') {
      const v = item as VideoClass
      newItem = new VideoClass(
        newId, v.title, v.url, v.duration, endTime,
        new Date(), new Date(), v.originalDuration, v.trimStart, v.trimEnd,
        v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
        v.zoom, v.zoomIntensity, v.row, v.muted,
        v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
      )
    } else if (type === 'image') {
      const img = item as ImageClass
      newItem = new ImageClass(
        newId, img.name, img.url, endTime, endTime + duration,
        img.x, img.y, img.width, img.height, img.opacity,
        new Date(), img.isMainTrack, img.zoom, img.cropAspect,
        img.cropSx, img.cropSy, img.cropSw, img.cropSh,
        img.zoomIntensity, img.row
      )
    } else {
      const t = item as TextClass
      newItem = new TextClass(
        newId, t.content, endTime, endTime + duration,
        t.x, t.y, t.width, t.height, t.opacity,
        t.fontSize, t.fontFamily, t.color, t.fontWeight, t.textAlign,
        t.animation,
        new Date(), t.row
      )
    }

    set((s) => {
      const nextVideos = s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp >= endTime) {
          return new VideoClass(
            v.id, v.title, v.url, v.duration, v.timestamp + duration,
            v.createdAt, v.updatedAt, v.originalDuration, v.trimStart, v.trimEnd,
            v.prompt, v.isOverlay, v.x, v.y, v.width, v.height, v.opacity,
            v.zoom, v.zoomIntensity, v.row, v.muted,
            v.cropAspect, v.cropSx, v.cropSy, v.cropSw, v.cropSh
          )
        }
        return v
      })

      const nextImages = s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime >= endTime) {
          return new ImageClass(
            img.id, img.name, img.url, img.startTime + duration, img.endTime + duration,
            img.x, img.y, img.width, img.height, img.opacity,
            img.createdAt, img.isMainTrack, img.zoom, img.cropAspect,
            img.cropSx, img.cropSy, img.cropSw, img.cropSh,
            img.zoomIntensity, img.row
          )
        }
        return img
      })

      const nextTexts = s.texts.map((t) => {
        if (isMainTrack && t.row === 0 && t.startTime >= endTime) {
          return new TextClass(
            t.id, t.content, t.startTime + duration, t.endTime + duration,
            t.x, t.y, t.width, t.height, t.opacity,
            t.fontSize, t.fontFamily, t.color, t.fontWeight, t.textAlign,
            t.animation,
            t.createdAt, t.row
          )
        }
        return t
      })

      return {
        videos: type === 'video' ? [...nextVideos, newItem as VideoClass] : nextVideos,
        images: type === 'image' ? [...nextImages, newItem as ImageClass] : nextImages,
        texts: type === 'text' ? [...nextTexts, newItem as TextClass] : nextTexts,
      }
    })

    if (type === 'video') useSelectionStore.getState().setSelectedVideoId(newId)
    else if (type === 'image') useSelectionStore.getState().setSelectedImageId(newId)
    else if (type === 'text') useSelectionStore.getState().setSelectedTextId(newId)

    set({ playbackTime: endTime })
    get().pushHistory()
  },

  addEffect: (effect: EffectClass) => {
    set((s) => ({ effects: [...s.effects, effect] }))
    get().pushHistory()
  },

  updateEffect: (id: string, updates: Partial<EffectClass>) => {
    set((s) => ({
      effects: s.effects.map((e) =>
        e.id === id
          ? new EffectClass(
              e.id,
              updates.type ?? e.type,
              updates.startTime ?? e.startTime,
              updates.endTime ?? e.endTime,
              e.createdAt
            )
          : e
      ),
    }))
    get().pushHistory()
  },

  removeEffect: (id: string) => {
    set((s) => ({ effects: s.effects.filter((e) => e.id !== id) }))
    get().pushHistory()
  },

  removeAllEffects: () => {
    set({ effects: [] })
    get().pushHistory()
  },

}))
