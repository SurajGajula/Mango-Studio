import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore } from './types'

export const createImageSlice = (set: any, get: any) => ({
  addImage: (image: ImageClass) => {
    const isMainTrack = image.row === 0
    const delta = image.duration

    useSelectionStore.getState().setSelectedImageId(image.id)
    set((state: ManifestStore) => ({
      images: [...state.images.map(img => {
        if (isMainTrack && img.row === 0 && img.startTime >= image.startTime) {
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }
        return img
      }), image],
      videos: state.videos.map(v => {
        if (isMainTrack && v.row === 0 && v.timestamp >= image.startTime) {
          return v.copy({ timestamp: v.timestamp + delta })
        }
        return v
      }),
    }))
    get().pushHistory()
  },

  removeImage: (id: string) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    const { selectedImageId, setSelectedImageId } = useSelectionStore.getState()
    if (selectedImageId === id) setSelectedImageId(null)

    const isMainTrack = image.row === 0
    const delta = -(image.duration)

    set((s: ManifestStore) => ({
      images: s.images
        .filter((o) => o.id !== id)
        .map((img) => {
          if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
            return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
          }
          return img
        }),
      videos: s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return v.copy({ timestamp: v.timestamp + delta })
        }
        return v
      })
    }))
    get().pushHistory()
  },

  updateImage: (id: string, updates: Partial<ImageClass>) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image) return

    const isMainTrack = image.row === 0
    const oldDuration = image.duration
    const newDuration = updates.endTime !== undefined && updates.startTime !== undefined 
      ? updates.endTime - updates.startTime 
      : (updates.endTime !== undefined ? updates.endTime - image.startTime : (updates.startTime !== undefined ? image.endTime - updates.startTime : image.duration))
    
    const durationDelta = newDuration - oldDuration
    const timestampDelta = (updates.startTime ?? image.startTime) - image.startTime
    const totalDelta = durationDelta + timestampDelta

    set((state: ManifestStore) => ({
      images: state.images.map((img) => {
        if (img.id === id) {
          return img.copy(updates)
        }
        if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
          return img.copy({ startTime: img.startTime + totalDelta, endTime: img.endTime + totalDelta })
        }
        return img
      }),
      videos: state.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return v.copy({ timestamp: v.timestamp + totalDelta })
        }
        return v
      })
    }))
    get().pushHistory()
  },

  splitImage: (id: string, playbackTime: number) => {
    const state = get()
    const image = state.images.find((img: ImageClass) => img.id === id)
    if (!image || !image.isMainTrack) return

    if (playbackTime <= image.startTime + 0.05 || playbackTime >= image.endTime - 0.05) return

    const firstHalf = image.copy({ endTime: playbackTime })
    const secondHalf = image.copy({
      id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: playbackTime,
      createdAt: new Date()
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
    const newSegments: ImageClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      return image.copy({
        id: i === 0 ? image.id : `image-${Date.now()}-${i}`,
        startTime: segStart,
        endTime: segEnd,
        createdAt: i === 0 ? image.createdAt : new Date()
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

    const isMainTrack = image.row === 0
    const delta = (video.duration ?? 0) - image.duration

    set((s: ManifestStore) => ({
      images: s.images
        .filter((img) => img.id !== imageId)
        .map((img) => {
          if (isMainTrack && img.row === 0 && img.startTime > image.startTime) {
            return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
          }
          return img
        }),
      videos: [...s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp > image.startTime) {
          return v.copy({ timestamp: v.timestamp + delta })
        }
        return v
      }), video],
    }))

    useSelectionStore.getState().setSelectedVideoId(video.id)
    get().pushHistory()
  },
})
