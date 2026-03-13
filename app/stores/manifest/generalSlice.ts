import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore, AspectRatio } from './types'

export const createGeneralSlice = (set: any, get: any) => ({
  playbackTime: 0,
  isPlaying: false,
  playbackRate: 1,
  aspectRatio: '16:9' as AspectRatio,
  pendingPrompt: null,

  setPendingPrompt: (prompt: string | null) => set({ pendingPrompt: prompt }),
  setPlaybackTime: (time: number) => set({ playbackTime: Math.max(0, time) }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setPlaybackRate: (rate: number) => set({ playbackRate: rate }),
  setAspectRatio: (ratio: AspectRatio) => {
    const state = get()
    if (state.videos.length === 0) set({ aspectRatio: ratio })
  },

  getTotalDuration: () => {
    const state = get()
    const videoEnd = state.videos
      .filter((v: VideoClass) => !v.isOverlay)
      .reduce((max: number, v: VideoClass) => Math.max(max, (v.timestamp ?? 0) + (v.duration ?? 0)), 0)
    const imageEnd = state.images
      .filter((img: ImageClass) => img.isMainTrack)
      .reduce((max: number, img: ImageClass) => Math.max(max, img.endTime), 0)
    return Math.max(videoEnd, imageEnd)
  },

  recalculateTimestamps: () => {},

  bulkUpdateMainTrackItems: (imagePatches: any[], videoTimestampPatches: any[]) => {
    const imgMap = new Map(imagePatches.map((p) => [p.id, p]))
    const vidMap = new Map(videoTimestampPatches.map((p) => [p.id, p]))
    set((state: ManifestStore) => ({
      images: state.images.map((img) => {
        const patch = imgMap.get(img.id)
        if (!patch) return img
        return img.copy({ startTime: patch.startTime ?? img.startTime, endTime: patch.endTime ?? img.endTime })
      }),
      videos: state.videos.map((v) => {
        const patch = vidMap.get(v.id)
        if (!patch) return v
        return v.copy({ timestamp: patch.timestamp ?? v.timestamp })
      }),
    }))
  },

  setItemPlaybackSpeed: (id: string, speed: number) => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    const audio = state.audios.find((a: any) => a.id === id)

    if (video) {
      const currentDuration = video.duration ?? 0
      const sourceDurationToPlay = currentDuration * speed
      const origDuration = video.originalDuration ?? currentDuration
      const maxAvailableSource = origDuration - video.trimStart

      let newDuration = currentDuration
      let newTrimEnd = video.trimEnd

      if (sourceDurationToPlay <= maxAvailableSource + 0.001) {
        newTrimEnd = Math.max(0, origDuration - video.trimStart - sourceDurationToPlay)
      } else {
        newDuration = maxAvailableSource / speed
        newTrimEnd = 0
      }

      const durationDelta = newDuration - currentDuration
      const isMainTrack = video.row === 0

      if (durationDelta !== 0 && isMainTrack) {
        get().trimVideo(id, video.trimStart, newTrimEnd)
        get().updateVideo(id, { playbackSpeed: speed })
      } else {
        get().updateVideo(id, { playbackSpeed: speed, trimEnd: newTrimEnd, duration: newDuration })
      }
    } else if (audio) {
      const currentDuration = audio.endTime - audio.startTime
      const sourceDurationToPlay = currentDuration * speed
      const origDuration = audio.originalDuration
      const maxAvailableSource = origDuration - audio.trimStart

      if (sourceDurationToPlay <= maxAvailableSource + 0.001) {
        const newTrimEnd = Math.max(0, origDuration - audio.trimStart - sourceDurationToPlay)
        get().updateAudio(id, { playbackSpeed: speed, trimEnd: newTrimEnd })
      } else {
        const newEffectiveDuration = maxAvailableSource / speed
        get().updateAudio(id, { playbackSpeed: speed, trimEnd: 0, endTime: audio.startTime + newEffectiveDuration })
      }
    }
  },

  duplicateItem: (id: string) => {
    const state = get()
    let item: any
    let type: 'video' | 'image' | 'text' = 'video'

    const vMatch = state.videos.find((v: VideoClass) => v.id === id)
    if (vMatch) {
      item = vMatch
      type = 'video'
    } else {
      const imgMatch = state.images.find((img: ImageClass) => img.id === id)
      if (imgMatch) {
        item = imgMatch
        type = 'image'
      } else {
        const tMatch = state.texts.find((t: TextClass) => t.id === id)
        if (tMatch) {
          item = tMatch
          type = 'text'
        }
      }
    }

    if (!item) return

    const isMainTrack = item.row === 0 || (type === 'image' && item.isMainTrack)
    const startTime = type === 'video' ? item.timestamp : item.startTime
    const duration = item.duration ?? 0
    const endTime = startTime + duration

    let newItem: any
    const newId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    if (type === 'video') {
      newItem = item.copy({ id: newId, timestamp: endTime, createdAt: new Date(), updatedAt: new Date() })
    } else if (type === 'image') {
      newItem = item.copy({ id: newId, startTime: endTime, endTime: endTime + duration, createdAt: new Date() })
    } else {
      newItem = item.copy({ id: newId, startTime: endTime, endTime: endTime + duration, createdAt: new Date() })
    }

    set((s: ManifestStore) => {
      const nextVideos = s.videos.map((v) => {
        if (isMainTrack && v.row === 0 && v.timestamp >= endTime) {
          return v.copy({ timestamp: v.timestamp + duration })
        }
        return v
      })

      const nextImages = s.images.map((img) => {
        if (isMainTrack && img.row === 0 && img.startTime >= endTime) {
          return img.copy({ startTime: img.startTime + duration, endTime: img.endTime + duration })
        }
        return img
      })

      const nextTexts = s.texts.map((t) => {
        if (isMainTrack && t.row === 0 && t.startTime >= endTime) {
          return t.copy({ startTime: t.startTime + duration, endTime: t.endTime + duration })
        }
        return t
      })

      return {
        videos: type === 'video' ? [...nextVideos, newItem] : nextVideos,
        images: type === 'image' ? [...nextImages, newItem] : nextImages,
        texts: type === 'text' ? [...nextTexts, newItem] : nextTexts,
      }
    })

    if (type === 'video') useSelectionStore.getState().setSelectedVideoId(newId)
    else if (type === 'image') useSelectionStore.getState().setSelectedImageId(newId)
    else if (type === 'text') useSelectionStore.getState().setSelectedTextId(newId)

    set({ playbackTime: endTime })
    get().pushHistory()
  },
})
