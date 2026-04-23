import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { generateId } from '@/app/lib/idUtils'
import { keyframesAfterSingleSplit, partitionImageKeyframesByAbsoluteBoundaries } from '@/app/lib/splitClipKeyframes'
import { ManifestStore } from './types'

export const createImageSlice = (set: any, get: any) => ({
  addImage: (image: ImageClass) => {
    useSelectionStore.getState().setSelectedImageId(image.id)
    set((state: ManifestStore) => ({
      images: [...state.images, image],
      videos: state.videos,
    }))
    get().pushHistory()
  },

  removeImage: (id: string) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    const { selectedImageId, setSelectedImageId } = useSelectionStore.getState()
    if (selectedImageId === id) setSelectedImageId(null)

    set((s: ManifestStore) => ({
      images: s.images.filter((o) => o.id !== id),
      videos: s.videos,
    }))
    get().pushHistory()
  },

  updateImage: (id: string, updates: Partial<ImageClass>) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    set((state: ManifestStore) => ({
      images: state.images.map((img) => {
        if (img.id === id) {
          return img.copy(updates)
        }
        return img
      })
    }))
    get().pushHistory()
  },

  splitImage: (id: string, playbackTime: number) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    if (playbackTime <= image.startTime + 0.05 || playbackTime >= image.endTime - 0.05) return

    const localSplit = playbackTime - image.startTime
    const { first: kfFirst, second: kfSecond } = keyframesAfterSingleSplit(image.keyframes ?? [], localSplit)

    const firstHalf = image.copy({ endTime: playbackTime, keyframes: kfFirst })
    const secondHalf = image.copy({
      id: generateId('image'),
      startTime: playbackTime,
      createdAt: new Date(),
      keyframes: kfSecond,
    })

    useSelectionStore.getState().setSelectedImageId(secondHalf.id)
    set((state: ManifestStore) => ({
      images: state.images
        .map((img) => (img.id === id ? firstHalf : img))
        .concat([secondHalf]),
    }))
    set({ playbackTime })
    get().pushHistory()
  },

  splitImageAtTimes: (id: string, times: number[]) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    const validTimes = times
      .filter((t) => t > image.startTime + 0.05 && t < image.endTime - 0.05)
      .sort((a, b) => a - b)

    if (validTimes.length === 0) return

    const boundaries = [image.startTime, ...validTimes, image.endTime]
    const segKeyframes = partitionImageKeyframesByAbsoluteBoundaries(image.startTime, image.keyframes ?? [], boundaries)
    const newSegments: ImageClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      return image.copy({
        id: i === 0 ? image.id : generateId('image'),
        startTime: segStart,
        endTime: segEnd,
        createdAt: i === 0 ? image.createdAt : new Date(),
        keyframes: segKeyframes[i] ?? [],
      })
    })

    set((s: ManifestStore) => ({
      images: s.images.filter((img) => img.id !== id).concat(newSegments),
    }))
    get().pushHistory()
  },

  replaceImageSource: (id: string, newUrl: string, newName: string) => {
    set((s: ManifestStore) => ({
      images: s.images.map((img) =>
        img.id === id ? img.copy({ name: newName, url: newUrl }) : img
      ),
    }))
    get().pushHistory()
  },

  replaceImageWithVideo: (imageId: string, video: VideoClass) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === imageId)
    if (!image) return

    const replacement = video.copy({
      timestamp: image.startTime,
      row: image.row,
    })
    const nextDuration = replacement.duration ?? 0
    const delta = nextDuration - image.duration

    set((s: ManifestStore) => {
      const nextImages = s.images.filter((img) => img.id !== imageId)
      const fromTime = image.endTime
      const nextVideos = [...s.videos, replacement]
      return {
        images: nextImages.map((img) => {
          if (img.row !== replacement.row) return img
          if (img.startTime < fromTime) return img
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }),
        videos: nextVideos.map((v) => {
          if (v.id === replacement.id) return v
          if (v.row !== replacement.row) return v
          if (v.timestamp < fromTime) return v
          return v.copy({ timestamp: v.timestamp + delta })
        }),
      }
    })

    useSelectionStore.getState().setSelectedVideoId(replacement.id)
    get().pushHistory()
  },
})
