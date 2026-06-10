import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { generateId } from '@/app/lib/idUtils'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'
import { manifestVideoTimelineSpanSeconds, syncVideoTrimDerivedFields } from '@/app/lib/timeUtils'
import { keyframesAfterSingleSplit, keyframesForVideoSegmentBoundaries } from '@/app/lib/splitClipKeyframes'
import {
  buildVideoSplitSegmentFields,
  videoLocalBoundariesFromSplitTimes,
} from '@/app/lib/splitVideoSegments'
import { ManifestStore, BlobEntry } from './types'

function splitSegmentCopyFields(index: number): Partial<VideoClass> {
  if (index === 0) return {}
  return { transition: 'none', transitionDuration: undefined }
}

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

    const timelineDuration = manifestVideoTimelineSpanSeconds(video)
    const localTime = playbackTime - video.timestamp
    if (localTime <= 0.05 || localTime >= timelineDuration - 0.05) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const localBoundaries = [0, localTime, timelineDuration]
    const [firstFields, secondFields] = buildVideoSplitSegmentFields(video, localBoundaries)

    const { first: kfFirst, second: kfSecond } = keyframesAfterSingleSplit(video.keyframes ?? [], localTime)

    const firstHalf = video.copy({
      duration: firstFields.duration,
      trimEnd: firstFields.trimEnd,
      sourceDuration: firstFields.sourceDuration,
      updatedAt: new Date(),
      originalDuration: origDuration,
      keyframes: kfFirst,
    })

    const secondHalf = video.copy({
      id: generateId('video'),
      duration: secondFields.duration,
      timestamp: secondFields.timestamp,
      trimStart: secondFields.trimStart,
      trimEnd: secondFields.trimEnd,
      sourceDuration: secondFields.sourceDuration,
      createdAt: new Date(),
      updatedAt: new Date(),
      originalDuration: origDuration,
      keyframes: kfSecond,
      ...splitSegmentCopyFields(1),
    })

    useSelectionStore.getState().setSelectedVideoId(secondHalf.id)
    set((state: ManifestStore) => ({
      videos: state.videos
        .map((v) => (v.id === id ? firstHalf : v))
        .concat([secondHalf]),
    }))

    get().recalculateTimestamps()
    set({ playbackTime: secondFields.timestamp })
    get().pushHistory()
  },

  splitVideoAtTimes: (id: string, times: number[]) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    if (!video) return

    const origDuration = video.originalDuration ?? video.duration ?? 0
    const localBoundaries = videoLocalBoundariesFromSplitTimes(video, times)
    if (localBoundaries.length <= 2) return

    const segFields = buildVideoSplitSegmentFields(video, localBoundaries)
    const segKeyframes = keyframesForVideoSegmentBoundaries(video.keyframes ?? [], localBoundaries)
    const newClips: VideoClass[] = segFields.map((fields, i) =>
      video.copy({
        id: i === 0 ? video.id : generateId('video'),
        duration: fields.duration,
        timestamp: fields.timestamp,
        createdAt: i === 0 ? video.createdAt : new Date(),
        updatedAt: new Date(),
        originalDuration: origDuration,
        trimStart: fields.trimStart,
        trimEnd: fields.trimEnd,
        sourceDuration: fields.sourceDuration,
        keyframes: segKeyframes[i] ?? [],
        ...splitSegmentCopyFields(i),
      })
    )

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
