import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore, AspectRatio } from './types'
import { calculateTotalDuration } from '@/app/lib/timeUtils'

export const createGeneralSlice = (set: any, get: any) => ({
  playbackTime: 0,
  isPlaying: false,
  playbackRate: 1,
  aspectRatio: '9:16' as AspectRatio,
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
    return calculateTotalDuration(state.videos, state.images, state.texts, state.audios)
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

  setItemPlaybackSpeed: (id: string, speed: number, speedStart?: number, speedEnd?: number, speedEasing?: 'linear' | 'ease') => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    const audio = state.audios.find((a: any) => a.id === id)

    if (video) {
      const currentDuration = video.duration ?? 0
      const sourceDurationToPlay = currentDuration * (video.playbackSpeed ?? 1)
      const origDuration = video.originalDuration ?? currentDuration
      const maxAvailableSource = origDuration - video.trimStart
      
      const newDuration = Math.min(maxAvailableSource / speed, sourceDurationToPlay / speed)
      const newTrimEnd = Math.max(0, origDuration - video.trimStart - (newDuration * speed))

      const durationDelta = newDuration - currentDuration
      const isMainTrack = video.row === 0

      const updates: any = { 
        playbackSpeed: speed, 
        speedStart: speedStart ?? speed, 
        speedEnd: speedEnd ?? speed,
        speedEasing: speedEasing ?? video.speedEasing ?? 'linear'
      }

      if (durationDelta !== 0 && isMainTrack) {
        get().trimVideo(id, video.trimStart, newTrimEnd)
        get().updateVideo(id, updates)
      } else {
        get().updateVideo(id, { ...updates, trimEnd: newTrimEnd, duration: newDuration })
      }
    } else if (audio) {
      const currentDuration = audio.endTime - audio.startTime
      const sourceDurationToPlay = currentDuration * (audio.playbackSpeed ?? 1)
      const origDuration = audio.originalDuration
      const maxAvailableSource = origDuration - audio.trimStart
      
      const newEffectiveDuration = Math.min(maxAvailableSource / speed, sourceDurationToPlay / speed)
      const newTrimEnd = Math.max(0, origDuration - audio.trimStart - (newEffectiveDuration * speed))

      const updates: any = { 
        playbackSpeed: speed, 
        speedStart: speedStart ?? speed, 
        speedEnd: speedEnd ?? speed,
        speedEasing: speedEasing ?? audio.speedEasing ?? 'linear'
      }

      get().updateAudio(id, { ...updates, trimEnd: newTrimEnd, endTime: audio.startTime + newEffectiveDuration })
    }
  },

  duplicateItem: (id: string) => {
    const state = get()
    let item: any
    let type: 'video' | 'image' | 'text' | 'audio' = 'video'

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
        } else {
          const aMatch = state.audios.find((a: any) => a.id === id)
          if (aMatch) {
            item = aMatch
            type = 'audio'
          }
        }
      }
    }

    if (!item) return

    const isMainTrack = type === 'video' ? item.row === 0 : (type === 'image' ? item.isMainTrack : (type === 'audio' ? !item.isOverlay : false))
    const startTime = type === 'video' ? item.timestamp : item.startTime
    const duration = type === 'audio' ? (item.originalDuration - item.trimStart - item.trimEnd) / (item.playbackSpeed ?? 1) : (item.duration ?? 0)
    const endTime = startTime + duration

    let newItem: any
    const newId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    if (type === 'video') {
      newItem = item.copy({ id: newId, timestamp: endTime, createdAt: new Date(), updatedAt: new Date() })
    } else if (type === 'audio') {
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

      const nextAudios = s.audios.map((a) => {
        if (isMainTrack && !a.isOverlay && a.startTime >= endTime) {
          return a.copy({ startTime: a.startTime + duration, endTime: a.endTime + duration })
        }
        return a
      })

      return {
        videos: type === 'video' ? [...nextVideos, newItem] : nextVideos,
        images: type === 'image' ? [...nextImages, newItem] : nextImages,
        texts: type === 'text' ? [...nextTexts, newItem] : nextTexts,
        audios: type === 'audio' ? [...nextAudios, newItem] : nextAudios,
      }
    })

    if (type === 'video') useSelectionStore.getState().setSelectedVideoId(newId)
    else if (type === 'image') useSelectionStore.getState().setSelectedImageId(newId)
    else if (type === 'text') useSelectionStore.getState().setSelectedTextId(newId)
    else if (type === 'audio') useSelectionStore.getState().setSelectedAudioId(newId)

    set({ playbackTime: endTime })
    get().pushHistory()
  },
})
