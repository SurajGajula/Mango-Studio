import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore, BlobEntry } from './types'

export const createVideoSlice = (set: any, get: any) => ({
  addVideo: (video: VideoClass) => {
    const isMainTrack = video.row === 0
    const delta = video.duration ?? 0

    useSelectionStore.getState().setSelectedVideoId(video.id)
    set((state: ManifestStore) => ({
      videos: [...state.videos.map(v => {
        if (isMainTrack && v.row === 0 && v.timestamp >= video.timestamp) {
          return v.copy({ timestamp: v.timestamp + delta })
        }
        return v
      }), video],
      images: state.images.map(img => {
        if (isMainTrack && img.row === 0 && img.startTime >= video.timestamp) {
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
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
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const { selectedVideoId, setSelectedVideoId } = useSelectionStore.getState()
    if (selectedVideoId === id) setSelectedVideoId(null)

    const isMainTrack = video.row === 0
    const delta = -(video.duration ?? 0)

    set((s: ManifestStore) => ({
      videos: s.videos
        .filter((v) => v.id !== id)
        .map((v) => {
          if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
            return v.copy({ timestamp: v.timestamp + delta })
          }
          return v
        }),
      images: s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }
        return img
      })
    }))
    get().recalculateTimestamps()
    get().pushHistory()
    
    // Manual pruning is handled in pushHistory, but we can do it here if needed
  },

  updateVideo: (id: string, updates: Partial<VideoClass>) => {
    set((state: ManifestStore) => ({
      videos: state.videos.map((video) => {
        if (video.id !== id) return video
        const newDuration = updates.duration ?? video.duration
        const newOrigDuration = updates.originalDuration ?? video.originalDuration ?? newDuration
        return video.copy({
          ...updates,
          updatedAt: new Date(),
          originalDuration: newOrigDuration,
          duration: newDuration
        })
      }),
    }))
    get().pushHistory()
  },

  trimVideo: (id: string, trimStart: number, trimEnd: number, newTimestamp?: number) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const clampedTrimStart = Math.max(0, Math.min(trimStart, origDuration - 0.1))
    const clampedTrimEnd = Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    const sourceDuration = origDuration - clampedTrimStart - clampedTrimEnd
    const newDuration = sourceDuration / (video.playbackSpeed ?? 1)
    const finalTimestamp = newTimestamp !== undefined ? newTimestamp : video.timestamp

    const isMainTrack = video.row === 0
    const oldDuration = video.duration ?? 0
    const durationDelta = newDuration - oldDuration
    const timestampDelta = finalTimestamp - video.timestamp
    const totalDelta = durationDelta + timestampDelta

    set((state: ManifestStore) => {
      const nextVideos = state.videos.map((v) => {
        if (v.id === id) {
          return v.copy({
            duration: newDuration,
            timestamp: finalTimestamp,
            updatedAt: new Date(),
            originalDuration: origDuration,
            trimStart: clampedTrimStart,
            trimEnd: clampedTrimEnd,
            sourceDuration
          })
        }
        if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
          return v.copy({ timestamp: v.timestamp + totalDelta })
        }
        return v
      })

      const nextImages = state.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return img.copy({ startTime: img.startTime + totalDelta, endTime: img.endTime + totalDelta })
        }
        return img
      })

      return { videos: nextVideos, images: nextImages }
    })

    get().recalculateTimestamps()
  },

  splitVideo: (id: string, playbackTime: number) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video || video.isOverlay) return

    const localTime = playbackTime - video.timestamp
    const duration = video.duration ?? 0
    if (localTime <= 0.05 || localTime >= duration - 0.05) return

    const origDuration = video.originalDuration ?? duration
    const originalSplitPoint = video.trimStart + localTime * (video.playbackSpeed ?? 1)

    const firstHalf = video.copy({
      duration: localTime,
      trimEnd: origDuration - originalSplitPoint,
      updatedAt: new Date(),
      originalDuration: origDuration
    })

    const secondHalf = video.copy({
      id: `video-${Date.now()}`,
      duration: duration - localTime,
      timestamp: video.timestamp + localTime,
      trimStart: originalSplitPoint,
      createdAt: new Date(),
      updatedAt: new Date(),
      originalDuration: origDuration
    })

    useSelectionStore.getState().setSelectedVideoId(secondHalf.id)
    set((state: ManifestStore) => ({
      videos: state.videos
        .map((v) => (v.id === id ? firstHalf : v))
        .concat([secondHalf]),
    }))

    get().recalculateTimestamps()
    set({ playbackTime: video.timestamp + localTime })
    get().pushHistory()
  },

  splitVideoAtTimes: (id: string, times: number[]) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
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
      return video.copy({
        id: i === 0 ? video.id : `video-${Date.now()}-${i}`,
        duration: segEnd - segStart,
        timestamp: video.timestamp + segStart,
        createdAt: i === 0 ? video.createdAt : new Date(),
        updatedAt: new Date(),
        originalDuration: origDuration,
        trimStart: video.trimStart + segStart * (video.playbackSpeed ?? 1),
        trimEnd: Math.max(0, origDuration - (video.trimStart + segEnd * (video.playbackSpeed ?? 1)))
      })
    })

    set((s: ManifestStore) => ({
      videos: s.videos.filter((v) => v.id !== id).concat(newClips),
    }))
    get().recalculateTimestamps()
    get().pushHistory()
  },

  replaceVideoSource: (id: string, newUrl: string, newTitle: string) => {
    set((s: ManifestStore) => ({
      videos: s.videos.map((v) =>
        v.id === id
          ? v.copy({ title: newTitle, url: newUrl, updatedAt: new Date() })
          : v
      ),
    }))
    get().pushHistory()
  },

  replaceVideoWithImage: (videoId: string, image: ImageClass) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === videoId)
    if (!video) return

    const isMainTrack = video.row === 0
    const delta = image.duration - (video.duration ?? 0)

    set((s: ManifestStore) => ({
      videos: s.videos
        .filter((v) => v.id !== videoId)
        .map((v) => {
          if (isMainTrack && v.row === 0 && v.timestamp > video.timestamp) {
            return v.copy({ timestamp: v.timestamp + delta })
          }
          return v
        }),
      images: [...s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime > video.timestamp) {
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }
        return img
      }), image],
    }))

    useSelectionStore.getState().setSelectedImageId(image.id)
    get().pushHistory()
  },
})
