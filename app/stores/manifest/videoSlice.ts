import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { generateId } from '@/app/lib/idUtils'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'
import { syncVideoTrimDerivedFields } from '@/app/lib/timeUtils'
import { keyframesAfterSingleSplit, keyframesForVideoSegmentBoundaries } from '@/app/lib/splitClipKeyframes'
import { ManifestStore, BlobEntry } from './types'

export const createVideoSlice = (set: any, get: any) => ({
  addVideo: (video: VideoClass) => {
    useSelectionStore.getState().setSelectedVideoId(video.id)
    set((state: ManifestStore) => ({
      videos: [...state.videos, video],
      images: state.images,
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

    set((s: ManifestStore) => ({
      videos: s.videos.filter((v) => v.id !== id),
      images: s.images,
    }))
    get().recalculateTimestamps()
    get().pushHistory()
    
    // Manual pruning is handled in pushHistory, but we can do it here if needed
  },

  updateVideo: (id: string, updates: Partial<VideoClass>) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const synced = syncVideoTrimDerivedFields(video, updates)

    set((s: ManifestStore) => ({
      videos: s.videos.map((v) => {
        if (v.id === id) {
          return v.copy({
            ...synced,
            updatedAt: new Date(),
          })
        }
        return v
      })
    }))
    get().pushHistory()
  },

  trimVideo: (id: string, trimStart: number, trimEnd: number, newTimestamp?: number) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const clampedTrimStart = quantizeTimelineSeconds(Math.max(0, Math.min(trimStart, origDuration - 0.1)))
    const clampedTrimEnd = quantizeTimelineSeconds(
      Math.max(0, Math.min(trimEnd, origDuration - clampedTrimStart - 0.1))
    )
    const sourceDuration = quantizeTimelineSeconds(origDuration - clampedTrimStart - clampedTrimEnd)
    const newDuration = quantizeTimelineSeconds(sourceDuration / (video.playbackSpeed ?? 1))
    const finalTimestamp =
      newTimestamp !== undefined ? quantizeTimelineSeconds(newTimestamp) : video.timestamp

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
        return v
      })
      return { videos: nextVideos }
    })

    get().recalculateTimestamps()
  },

  splitVideo: (id: string, playbackTime: number) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const localTime = playbackTime - video.timestamp
    const duration = video.duration ?? 0
    if (localTime <= 0.05 || localTime >= duration - 0.05) return

    const origDuration = video.originalDuration ?? duration
    const originalSplitPoint = quantizeTimelineSeconds(
      video.trimStart + localTime * (video.playbackSpeed ?? 1)
    )

    const { first: kfFirst, second: kfSecond } = keyframesAfterSingleSplit(video.keyframes ?? [], localTime)

    const firstHalf = video.copy({
      duration: quantizeTimelineSeconds(localTime),
      trimEnd: quantizeTimelineSeconds(origDuration - originalSplitPoint),
      updatedAt: new Date(),
      originalDuration: origDuration,
      keyframes: kfFirst,
    })

    const secondHalf = video.copy({
      id: generateId('video'),
      duration: quantizeTimelineSeconds(duration - localTime),
      timestamp: quantizeTimelineSeconds(video.timestamp + localTime),
      trimStart: originalSplitPoint,
      createdAt: new Date(),
      updatedAt: new Date(),
      originalDuration: origDuration,
      keyframes: kfSecond,
    })

    useSelectionStore.getState().setSelectedVideoId(secondHalf.id)
    set((state: ManifestStore) => ({
      videos: state.videos
        .map((v) => (v.id === id ? firstHalf : v))
        .concat([secondHalf]),
    }))

    get().recalculateTimestamps()
    set({ playbackTime: quantizeTimelineSeconds(video.timestamp + localTime) })
    get().pushHistory()
  },

  splitVideoAtTimes: (id: string, times: number[]) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const duration = video.duration ?? 0
    const origDuration = video.originalDuration ?? duration

    const epsilon = 1e-6
    const relTimes = times
      .map((t) => t - video.timestamp)
      .filter((t) => t > epsilon && t < duration - epsilon)
      .sort((a, b) => a - b)
      .filter((t, i, arr) => i === 0 || t - arr[i - 1] > epsilon)

    if (relTimes.length === 0) return

    const boundaries = [0, ...relTimes, duration]
    const segKeyframes = keyframesForVideoSegmentBoundaries(video.keyframes ?? [], boundaries)
    const newClips: VideoClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      const segTrimStart = quantizeTimelineSeconds(
        video.trimStart + segStart * (video.playbackSpeed ?? 1)
      )
      const segTrimEnd = quantizeTimelineSeconds(
        Math.max(0, origDuration - (video.trimStart + segEnd * (video.playbackSpeed ?? 1)))
      )
      return video.copy({
        id: i === 0 ? video.id : generateId('video'),
        duration: quantizeTimelineSeconds(segEnd - segStart),
        timestamp: quantizeTimelineSeconds(video.timestamp + segStart),
        createdAt: i === 0 ? video.createdAt : new Date(),
        updatedAt: new Date(),
        originalDuration: origDuration,
        trimStart: segTrimStart,
        trimEnd: segTrimEnd,
        keyframes: segKeyframes[i] ?? [],
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

    const oldDuration = video.duration ?? 0
    const replacement = image.copy({
      startTime: video.timestamp,
      endTime: video.timestamp + image.duration,
      row: video.row,
    })
    const delta = replacement.duration - oldDuration

    set((s: ManifestStore) => {
      const nextVideos = s.videos.filter((v) => v.id !== videoId)
      const fromTime = video.timestamp + oldDuration
      const nextImages = [...s.images, replacement]
      return {
        videos: nextVideos.map((v) => {
          if (v.row !== replacement.row) return v
          if (v.timestamp < fromTime) return v
          return v.copy({ timestamp: v.timestamp + delta })
        }),
        images: nextImages.map((img) => {
          if (img.id === replacement.id) return img
          if (img.row !== replacement.row) return img
          if (img.startTime < fromTime) return img
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }),
      }
    })

    useSelectionStore.getState().setSelectedImageId(replacement.id)
    get().pushHistory()
  },
})
