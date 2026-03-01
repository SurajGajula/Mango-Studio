import { create } from 'zustand'
import { VideoClass } from '@/app/models/VideoClass'

export type AspectRatio = '16:9' | '9:16'

interface ManifestStore {
  videos: VideoClass[]
  selectedVideoId: string | null
  replaceTargetId: string | null
  playbackTime: number
  isPlaying: boolean
  aspectRatio: AspectRatio
  addVideo: (video: VideoClass) => void
  replaceVideo: (targetId: string, newVideo: VideoClass) => void
  removeVideo: (id: string) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  trimVideo: (id: string, trimStart: number, trimEnd: number) => void
  resetVideoTrim: (id: string) => void
  recalculateTimestamps: () => void
  getTotalDuration: () => number
  getVideo: (id: string) => VideoClass | undefined
  clearVideos: () => void
  setSelectedVideoId: (id: string | null) => void
  setReplaceTargetId: (id: string | null) => void
  getSelectedVideo: () => VideoClass | undefined
  setPlaybackTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setAspectRatio: (ratio: AspectRatio) => void
}

export const useManifestStore = create<ManifestStore>((set, get) => ({
  videos: [],
  selectedVideoId: null,
  replaceTargetId: null,
  playbackTime: 0,
  isPlaying: false,
  aspectRatio: '16:9',

  addVideo: (video: VideoClass) => {
    set((state) => {
      const totalDuration = state.videos.reduce((sum, v) => sum + (v.duration || 0), 0)
      const newVideo = new VideoClass(
        video.id,
        video.title,
        video.url,
        video.duration,
        totalDuration,
        video.createdAt,
        video.updatedAt
      )
      return {
        videos: [...state.videos, newVideo],
        selectedVideoId: newVideo.id,
        playbackTime: newVideo.timestamp,
        isPlaying: false,
      }
    })
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
        newVideo.updatedAt
      )

      const updatedVideos = [...state.videos]
      updatedVideos[targetIndex] = replacementVideo

      return {
        videos: updatedVideos,
        selectedVideoId: replacementVideo.id,
        replaceTargetId: null,
        playbackTime: replacementVideo.timestamp,
      }
    })
    get().recalculateTimestamps()
  },

  removeVideo: (id: string) => {
    set((state) => {
      const videoToRemove = state.videos.find((video) => video.id === id)
      if (videoToRemove?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(videoToRemove.url)
      }
      return {
        videos: state.videos.filter((video) => video.id !== id),
      }
    })
  },

  updateVideo: (id: string, updates: Partial<VideoClass>) => {
    set((state) => ({
      videos: state.videos.map((video) => {
        if (video.id === id) {
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
            updates.trimEnd ?? video.trimEnd
          )
        }
        return video
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
        if (v.id === id) {
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
            clampedTrimEnd
          )
        }
        return v
      }),
    }))

    get().recalculateTimestamps()
  },

  resetVideoTrim: (id: string) => {
    const state = get()
    const video = state.videos.find((v) => v.id === id)
    if (!video) return

    set((state) => ({
      videos: state.videos.map((v) => {
        if (v.id === id) {
          return new VideoClass(
            v.id,
            v.title,
            v.url,
            v.originalDuration ?? v.duration,
            v.timestamp,
            v.createdAt,
            new Date(),
            v.originalDuration ?? v.duration,
            0,
            0
          )
        }
        return v
      }),
    }))

    get().recalculateTimestamps()
  },

  recalculateTimestamps: () => {
    set((state) => {
      const sorted = [...state.videos].sort((a, b) => a.timestamp - b.timestamp)
      let currentTime = 0
      const updatedVideos = sorted.map((video) => {
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
          video.trimEnd
        )
        currentTime += video.duration ?? 0
        return newVideo
      })
      return { videos: updatedVideos }
    })
  },

  getTotalDuration: () => {
    return get().videos.reduce((sum, video) => sum + (video.duration || 0), 0)
  },

  getVideo: (id: string) => {
    return get().videos.find((video) => video.id === id)
  },

  clearVideos: () => {
    set({ videos: [], selectedVideoId: null, playbackTime: 0, isPlaying: false })
  },

  setSelectedVideoId: (id: string | null) => {
    set({ selectedVideoId: id })
  },

  setReplaceTargetId: (id: string | null) => {
    set({ replaceTargetId: id })
  },

  getSelectedVideo: () => {
    const state = get()
    if (!state.selectedVideoId) return undefined
    return state.videos.find((video) => video.id === state.selectedVideoId)
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
}))
