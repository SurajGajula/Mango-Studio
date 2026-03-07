import { create } from 'zustand'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { useSelectionStore } from '@/app/stores/selectionStore'

export type AspectRatio = '16:9' | '9:16'

interface HistoryEntry {
  videos: VideoClass[]
  images: ImageClass[]
}

const MAX_HISTORY = 50

interface ManifestStore {
  videos: VideoClass[]
  images: ImageClass[]
  replaceTargetId: string | null
  pendingPrompt: string | null
  playbackTime: number
  isPlaying: boolean
  aspectRatio: AspectRatio
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: () => void
  undo: () => void
  redo: () => void
  addVideo: (video: VideoClass) => void
  replaceVideo: (targetId: string, newVideo: VideoClass) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  removeVideo: (id: string) => void
  trimVideo: (id: string, trimStart: number, trimEnd: number) => void
  splitVideo: (id: string, playbackTime: number) => void
  splitImage: (id: string, playbackTime: number) => void
  recalculateTimestamps: () => void
  getTotalDuration: () => number
  setReplaceTargetId: (id: string | null) => void
  setPendingPrompt: (prompt: string | null) => void
  setPlaybackTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setAspectRatio: (ratio: AspectRatio) => void
  addImage: (image: ImageClass) => void
  removeImage: (id: string) => void
  updateImage: (id: string, updates: Partial<ImageClass>) => void
  replaceImageSource: (id: string, newUrl: string, newName: string) => void
  bulkUpdateMainTrackItems: (
    imagePatches: Array<{ id: string; startTime?: number; endTime?: number }>,
    videoTimestampPatches: Array<{ id: string; timestamp: number }>
  ) => void
}

function collectUrls(entries: HistoryEntry[]): Set<string> {
  const urls = new Set<string>()
  for (const entry of entries) {
    for (const v of entry.videos) if (v.url) urls.add(v.url)
    for (const img of entry.images) if (img.url) urls.add(img.url)
  }
  return urls
}

function pruneUrls(
  prevHistory: HistoryEntry[],
  nextHistory: HistoryEntry[],
  liveVideos: VideoClass[],
  liveImages: ImageClass[]
) {
  const live: HistoryEntry = { videos: liveVideos, images: liveImages }
  const kept = collectUrls([...nextHistory, live])
  const had = collectUrls(prevHistory)
  for (const url of had) {
    if (!kept.has(url) && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }
}

export const useManifestStore = create<ManifestStore>((set, get) => ({
  videos: [],
  images: [],
  replaceTargetId: null,
  pendingPrompt: null,
  playbackTime: 0,
  isPlaying: false,
  aspectRatio: '16:9',
  history: [{ videos: [], images: [] }],
  historyIndex: 0,

  pushHistory: () => {
    const state = get()
    const entry: HistoryEntry = {
      videos: [...state.videos],
      images: [...state.images],
    }
    const current = state.history[state.historyIndex]
    if (current && JSON.stringify(current) === JSON.stringify(entry)) return
    const truncated = state.history.slice(0, state.historyIndex + 1)
    const next = [...truncated, entry]
    const evicted = next.length > MAX_HISTORY ? next.slice(0, next.length - MAX_HISTORY) : []
    const trimmed = next.slice(-MAX_HISTORY)
    if (evicted.length > 0) {
      pruneUrls(evicted, trimmed, state.videos, state.images)
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
      historyIndex: state.historyIndex + 1,
      isPlaying: false,
    })
    get().recalculateTimestamps()
  },

  addVideo: (video: VideoClass) => {
    set((state) => {
      const mainDuration = state.videos
        .filter((v) => !v.isOverlay)
        .reduce((sum, v) => sum + (v.duration || 0), 0)
      const timestamp = video.isOverlay ? (video.timestamp ?? 0) : mainDuration
      const newVideo = new VideoClass(
        video.id,
        video.title,
        video.url,
        video.duration,
        timestamp,
        video.createdAt,
        video.updatedAt,
        video.originalDuration,
        video.trimStart,
        video.trimEnd,
        video.prompt,
        video.isOverlay,
        video.x,
        video.y,
        video.width,
        video.height,
        video.opacity
      )
      useSelectionStore.getState().setSelectedVideoId(newVideo.id)
      return {
        videos: [...state.videos, newVideo],
        playbackTime: video.isOverlay ? state.playbackTime : newVideo.timestamp,
        isPlaying: false,
      }
    })
    get().pushHistory()
  },

  replaceVideo: (targetId: string, newVideo: VideoClass) => {
    set((state) => {
      const targetIndex = state.videos.findIndex((v) => v.id === targetId)
      if (targetIndex === -1) return state

      const targetVideo = state.videos[targetIndex]
      const replacementVideo = new VideoClass(
        newVideo.id,
        newVideo.title,
        newVideo.url,
        newVideo.duration,
        targetVideo.timestamp,
        newVideo.createdAt,
        newVideo.updatedAt,
        undefined,
        undefined,
        undefined,
        newVideo.prompt,
        targetVideo.isOverlay,
        targetVideo.x,
        targetVideo.y,
        targetVideo.width,
        targetVideo.height,
        targetVideo.opacity
      )

      const updatedVideos = [...state.videos]
      updatedVideos[targetIndex] = replacementVideo

      useSelectionStore.getState().setSelectedVideoId(replacementVideo.id)
      return {
        videos: updatedVideos,
        replaceTargetId: null,
        playbackTime: replacementVideo.timestamp,
      }
    })
    get().recalculateTimestamps()
    get().pushHistory()
  },

  removeVideo: (id: string) => {
    const state = get()
    const { selectedVideoId, setSelectedVideoId } = useSelectionStore.getState()
    if (selectedVideoId === id) setSelectedVideoId(null)
    set((s) => ({
      videos: s.videos.filter((v) => v.id !== id),
      replaceTargetId: s.replaceTargetId === id ? null : s.replaceTargetId,
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
        return new VideoClass(
          video.id,
          updates.title ?? video.title,
          updates.url ?? video.url,
          updates.duration ?? video.duration,
          updates.timestamp ?? video.timestamp,
          video.createdAt,
          new Date(),
          updates.originalDuration ?? video.originalDuration,
          updates.trimStart ?? video.trimStart,
          updates.trimEnd ?? video.trimEnd,
          updates.prompt ?? video.prompt,
          updates.isOverlay ?? video.isOverlay,
          updates.x ?? video.x,
          updates.y ?? video.y,
          updates.width ?? video.width,
          updates.height ?? video.height,
          updates.opacity ?? video.opacity
        )
      }),
    }))
  },

  trimVideo: (id: string, trimStart: number, trimEnd: number) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const clampedTrimStart = Math.max(0, Math.min(trimStart, origDuration - 0.1))
    const clampedTrimEnd = Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    const newDuration = origDuration - clampedTrimStart - clampedTrimEnd

    set((state) => ({
      videos: state.videos.map((v) => {
        if (v.id !== id) return v
        return new VideoClass(
          v.id,
          v.title,
          v.url,
          newDuration,
          v.timestamp,
          v.createdAt,
          new Date(),
          v.originalDuration ?? v.duration,
          clampedTrimStart,
          clampedTrimEnd,
          v.prompt,
          v.isOverlay,
          v.x,
          v.y,
          v.width,
          v.height,
          v.opacity
        )
      }),
    }))

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
      video.prompt
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
      video.prompt
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
      true
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
      true
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
    set((state) => {
      const mainVideos = state.videos.filter((v) => !v.isOverlay).sort((a, b) => a.timestamp - b.timestamp)
      const overlayVideos = state.videos.filter((v) => v.isOverlay)
      let currentTime = 0
      const updatedMain = mainVideos.map((video) => {
        const newVideo = new VideoClass(
          video.id,
          video.title,
          video.url,
          video.duration,
          currentTime,
          video.createdAt,
          new Date(),
          video.originalDuration,
          video.trimStart,
          video.trimEnd,
          video.prompt
        )
        currentTime += video.duration ?? 0
        return newVideo
      })
      return { videos: [...updatedMain, ...overlayVideos] }
    })
  },

  getTotalDuration: () => {
    const videoDuration = get().videos
      .filter((v) => !v.isOverlay)
      .reduce((sum, video) => sum + (video.duration || 0), 0)
    const imageEnd = get().images
      .filter((img) => img.isMainTrack)
      .reduce((max, img) => Math.max(max, img.endTime), 0)
    return Math.max(videoDuration, imageEnd)
  },

  setReplaceTargetId: (id: string | null) => {
    set({ replaceTargetId: id })
  },

  setPendingPrompt: (prompt: string | null) => {
    set({ pendingPrompt: prompt })
  },

  setPlaybackTime: (time: number) => {
    set({ playbackTime: time })
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing })
  },

  setAspectRatio: (ratio: AspectRatio) => {
    const state = get()
    if (state.videos.length === 0) {
      set({ aspectRatio: ratio })
    }
  },

  addImage: (image: ImageClass) => {
    useSelectionStore.getState().setSelectedImageId(image.id)
    set((state) => ({
      images: [...state.images, image],
    }))
    get().pushHistory()
  },

  removeImage: (id: string) => {
    const state = get()
    const { selectedImageId, setSelectedImageId } = useSelectionStore.getState()
    if (selectedImageId === id) setSelectedImageId(null)
    set((s) => ({
      images: s.images.filter((o) => o.id !== id),
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
    set((state) => ({
      images: state.images.map((image) =>
        image.id === id
          ? new ImageClass(
              image.id,
              updates.name ?? image.name,
              updates.url ?? image.url,
              updates.startTime ?? image.startTime,
              updates.endTime ?? image.endTime,
              updates.x ?? image.x,
              updates.y ?? image.y,
              updates.width ?? image.width,
              updates.height ?? image.height,
              updates.opacity ?? image.opacity,
              image.createdAt,
              updates.isMainTrack ?? image.isMainTrack
            )
          : image
      ),
    }))
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
              img.createdAt, img.isMainTrack
            )
          : img
      ),
    }))
    const nextState = get()
    const urlStillInUse = nextState.images.some((img) => img.url === oldUrl)
    if (!urlStillInUse && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl)
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
          img.createdAt, img.isMainTrack
        )
      }),
      videos: state.videos.map((v) => {
        const patch = vidMap.get(v.id)
        if (!patch) return v
        return new VideoClass(
          v.id, v.title, v.url, v.duration, patch.timestamp,
          v.createdAt, v.updatedAt, v.originalDuration,
          v.trimStart, v.trimEnd, v.prompt,
          v.isOverlay, v.x, v.y, v.width, v.height, v.opacity
        )
      }),
    }))
  },


}))
