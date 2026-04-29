import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import { TextClass } from '@/app/models/TextClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore } from './types'
import { overlapsAny, occupancyIntervalsOnRow } from '@/app/lib/timeline'
import { calculateTotalDuration } from '@/app/lib/timeUtils'
import { calculateSourceTime } from '@/app/lib/renderUtils'
import { generateId } from '@/app/lib/idUtils'
export const createGeneralSlice = (set: any, get: any) => ({
  playbackTime: 0,
  isPlaying: false,
  isLooping: false,
  playbackRate: 1,
  pendingPrompt: null,
  pendingVideoReplaceSpeed: null,
  videoReplaceFilePickerRequest: null,

  setPendingPrompt: (prompt: string | null) => set({ pendingPrompt: prompt }),
  setPendingVideoReplaceSpeed: (value: ManifestStore['pendingVideoReplaceSpeed']) =>
    set({ pendingVideoReplaceSpeed: value }),
  setVideoReplaceFilePickerRequest: (value: ManifestStore['videoReplaceFilePickerRequest']) =>
    set({ videoReplaceFilePickerRequest: value }),
  setPlaybackTime: (time: number) => set({ playbackTime: Math.max(0, time) }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setIsLooping: (looping: boolean) => set({ isLooping: looping }),
  setPlaybackRate: (rate: number) => set({ playbackRate: rate }),
  getTotalDuration: () => {
    const state = get()
    return calculateTotalDuration(state.videos, state.images, state.texts, state.audios)
  },

  moveItemToRow: (id: string, targetRow: number, newTime?: number) => {
    const state = get()
    let item: any
    let type: 'video' | 'image' | 'text' | 'audio' | 'effect' = 'video'

    const vMatch = state.videos.find((v: any) => v.id === id)
    if (vMatch) {
      item = vMatch
      type = 'video'
    } else {
      const imgMatch = state.images.find((img: any) => img.id === id)
      if (imgMatch) {
        item = imgMatch
        type = 'image'
      } else {
        const tMatch = state.texts.find((t: any) => t.id === id)
        if (tMatch) {
          item = tMatch
          type = 'text'
        } else {
          const aMatch = state.audios.find((a: any) => a.id === id)
          if (aMatch) {
            item = aMatch
            type = 'audio'
          } else {
            const eMatch = state.effects.find((e: any) => e.id === id)
            if (eMatch) {
              item = eMatch
              type = 'effect'
            }
          }
        }
      }
    }

    if (!item) return

    if (type === 'audio') {
      targetRow = Math.max(1, targetRow)
    }

    const startTime = type === 'video' ? item.timestamp : item.startTime
    const duration = type === 'audio' ? (item.originalDuration - item.trimStart - item.trimEnd) / (item.playbackSpeed ?? 1) : (item.duration ?? (item.endTime - item.startTime))
    const finalTime = newTime !== undefined ? newTime : startTime

    const oldRow = item.row
    if (oldRow === targetRow && newTime === undefined) return

    if (targetRow >= 0) {
      const segEnd = finalTime + duration
      if (overlapsAny(finalTime, segEnd, occupancyIntervalsOnRow(state, targetRow, type, id), 0.01)) {
        return
      }
    }

    set((s: ManifestStore) => {
      let nextVideos = [...s.videos]
      let nextImages = [...s.images]
      let nextTexts = [...s.texts]
      let nextAudios = [...s.audios]
      let nextEffects = [...s.effects]

      const updates: any = { row: targetRow }
      if (newTime !== undefined) {
        if (type === 'video') updates.timestamp = newTime
        else {
          updates.startTime = newTime
          updates.endTime = newTime + duration
        }
      }
      
      if (type === 'video') nextVideos = nextVideos.map(v => v.id === id ? v.copy(updates) : v)
      else if (type === 'image') nextImages = nextImages.map(img => img.id === id ? img.copy(updates) : img)
      else if (type === 'text') nextTexts = nextTexts.map(t => t.id === id ? t.copy(updates) : t)
      else if (type === 'audio') nextAudios = nextAudios.map(a => a.id === id ? a.copy(updates) : a)
      else if (type === 'effect') nextEffects = nextEffects.map(e => e.id === id ? e.copy(updates) : e)

      return {
        videos: nextVideos,
        images: nextImages,
        texts: nextTexts,
        audios: nextAudios,
        effects: nextEffects
      }
    })

    get().pushHistory()
  },

  insertRow: (atIndex: number) => {
    if (atIndex <= 0) return
    set((s: ManifestStore) => ({
      videos: s.videos.map((v) => {
        if (v.row < atIndex) return v
        const row = v.row + 1
        return v.copy({ row })
      }),
      images: s.images.map((img) => {
        if (img.row < atIndex) return img
        const row = img.row + 1
        return img.copy({ row })
      }),
      texts: s.texts.map(t => t.row >= atIndex ? t.copy({ row: t.row + 1 }) : t),
      audios: s.audios.map((a) => {
        if (a.row < atIndex) return a
        const row = a.row + 1
        return a.copy({ row })
      }),
      effects: s.effects.map(e => e.row >= atIndex ? e.copy({ row: e.row + 1 }) : e),
    }))
    get().pushHistory()
  },

  deleteRow: (atIndex: number) => {
    if (atIndex <= 0) return
    set((s: ManifestStore) => {
      return {
        videos: s.videos.map((v) => {
          if (v.row < atIndex) return v
          const row = v.row - 1
          return v.copy({ row })
        }),
        images: s.images.map((img) => {
          if (img.row < atIndex) return img
          const row = img.row - 1
          return img.copy({ row })
        }),
        texts: s.texts.map(t => t.row === atIndex ? t.copy({ row: t.row - 1 }) : (t.row > atIndex ? t.copy({ row: t.row - 1 }) : t)),
        audios: s.audios.map((a) => {
          if (a.row < atIndex) return a
          const row = a.row - 1
          return a.copy({ row })
        }),
        effects: s.effects.map(e => e.row === atIndex ? e.copy({ row: e.row - 1 }) : (e.row > atIndex ? e.copy({ row: e.row - 1 }) : e)),
      }
    })
    get().pushHistory()
  },

  recalculateTimestamps: () => {
    return
  },

  setItemPlaybackSpeed: (id: string, speed: number, speedStart?: number, speedEnd?: number, speedEasing?: 'linear' | 'ease') => {
    const state = get()
    const video = state.videos.find((v: VideoClass) => v.id === id)
    const audio = state.audios.find((a: any) => a.id === id)

    let effectiveSpeed = speed
    if (speedStart !== undefined && speedEnd !== undefined) {
      effectiveSpeed = (speedStart + speedEnd) / 2
    }

    if (video) {
      const D = video.duration ?? 0
      if (D <= 1e-6) return true

      const origDuration = video.originalDuration ?? D
      const maxSource = origDuration - video.trimStart
      if (maxSource <= 1e-6) return false

      const newSS = speedStart ?? speed
      const newSE = speedEnd ?? speed
      const newEasing = speedEasing ?? video.speedEasing ?? 'linear'
      const requiredSource = calculateSourceTime(D, D, newSS, newSE, speed, newEasing)

      if (requiredSource > maxSource + 1e-3) {
        return false
      }

      const newTrimEnd = Math.max(0, origDuration - video.trimStart - requiredSource)

      const updates: any = {
        playbackSpeed: speed,
        speedStart: newSS,
        speedEnd: newSE,
        speedEasing: newEasing,
        trimEnd: newTrimEnd,
        duration: D,
        sourceDuration: requiredSource,
      }

      get().updateVideo(id, updates)
      return true
    } else if (audio) {
      const currentDuration = audio.endTime - audio.startTime
      const sourceDurationToPlay = currentDuration * (audio.playbackSpeed ?? 1)
      const origDuration = audio.originalDuration
      const maxAvailableSource = origDuration - audio.trimStart
      
      const newEffectiveDuration = Math.min(maxAvailableSource / effectiveSpeed, sourceDurationToPlay / effectiveSpeed)
      const newTrimEnd = Math.max(0, origDuration - audio.trimStart - (newEffectiveDuration * effectiveSpeed))

      const updates: any = { 
        playbackSpeed: speed, 
        speedStart: speedStart ?? speed, 
        speedEnd: speedEnd ?? speed,
        speedEasing: speedEasing ?? audio.speedEasing ?? 'linear'
      }

      get().updateAudio(id, { ...updates, trimEnd: newTrimEnd, endTime: audio.startTime + newEffectiveDuration })
      return true
    }
    return false
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

    const startTime = type === 'video' ? item.timestamp : item.startTime
    const duration = type === 'audio' ? (item.originalDuration - item.trimStart - item.trimEnd) / (item.playbackSpeed ?? 1) : (item.duration ?? 0)
    const endTime = startTime + duration
    const duplicateStart = endTime
    const duplicateEnd = duplicateStart + duration

    let newItem: any
    const newId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    let targetRow = item.row
    if (overlapsAny(duplicateStart, duplicateEnd, occupancyIntervalsOnRow(state, targetRow, null, null), 0.01)) {
      while (overlapsAny(duplicateStart, duplicateEnd, occupancyIntervalsOnRow(state, targetRow, null, null), 0.01)) {
        targetRow += 1
      }
    }

    if (type === 'video') {
      newItem = item.copy({
        id: newId,
        row: targetRow,
        timestamp: duplicateStart,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    } else if (type === 'audio') {
      newItem = item.copy({
        id: newId,
        row: targetRow,
        startTime: duplicateStart,
        endTime: duplicateEnd,
        createdAt: new Date(),
      })
    } else {
      newItem = item.copy({
        id: newId,
        row: targetRow,
        startTime: duplicateStart,
        endTime: duplicateEnd,
        createdAt: new Date(),
      })
    }
    if (type === 'video' || type === 'image') {
      newItem = newItem.copy({
        keyframes: (newItem.keyframes ?? []).map((k: MediaKeyframe) => ({ ...k, id: generateId('kf') })),
      })
    }
    if (type === 'audio') {
      newItem = newItem.copy({
        marks: newItem.marks.map((m: { id: string; t: number }) => ({ ...m, id: generateId('amark') })),
      })
    }

    set((s: ManifestStore) => {
      return {
        videos: type === 'video' ? [...s.videos, newItem] : s.videos,
        images: type === 'image' ? [...s.images, newItem] : s.images,
        texts: type === 'text' ? [...s.texts, newItem] : s.texts,
        audios: type === 'audio' ? [...s.audios, newItem] : s.audios,
      }
    })

    if (type === 'video') useSelectionStore.getState().setSelectedVideoId(newId)
    else if (type === 'image') useSelectionStore.getState().setSelectedImageId(newId)
    else if (type === 'text') useSelectionStore.getState().setSelectedTextId(newId)
    else if (type === 'audio') useSelectionStore.getState().setSelectedAudioId(newId)

    set({ playbackTime: endTime })
    get().pushHistory()
  },

  duplicateTimelineRange: (kind: 'image' | 'video', firstNumber: number, lastNumber: number) => {
    if (firstNumber < 1 || lastNumber < firstNumber) return
    const state = get()
    const now = new Date()

    if (kind === 'image') {
      const sorted = [...state.images].sort((a, b) => a.startTime - b.startTime)
      const slice = sorted.slice(firstNumber - 1, lastNumber)
      if (slice.length === 0) return
      const blockStart = Math.min(...slice.map((i) => i.startTime))
      const blockEnd = Math.max(...slice.map((i) => i.endTime))
      const delta = blockEnd - blockStart
      const newItems = slice.map((img) =>
        img.copy({
          id: generateId('image'),
          startTime: img.startTime + delta,
          endTime: img.endTime + delta,
          createdAt: now,
          keyframes: (img.keyframes ?? []).map((k: MediaKeyframe) => ({ ...k, id: generateId('kf') })),
        })
      )

      set((s: ManifestStore) => {
        const rowsInSlice = new Set(slice.map((img) => img.row))
        const selectedIds = new Set(slice.map((img) => img.id))
        const nextImages = s.images
          .map((img) => {
            if (!rowsInSlice.has(img.row)) return img
            if (selectedIds.has(img.id)) return img
            if (img.startTime < blockEnd) return img
            return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
          })
          .concat(newItems)
        return { videos: s.videos, images: nextImages, texts: s.texts, audios: s.audios }
      })

      set({ playbackTime: blockEnd })
      get().pushHistory()
      return
    }

    const sorted = [...state.videos].sort((a, b) => a.timestamp - b.timestamp)
    const slice = sorted.slice(firstNumber - 1, lastNumber)
    if (slice.length === 0) return
    const blockStart = Math.min(...slice.map((v) => v.timestamp))
    const blockEnd = Math.max(...slice.map((v) => v.timestamp + (v.duration ?? 0)))
    const delta = blockEnd - blockStart
    const newItems = slice.map((vid) =>
      vid.copy({
        id: generateId('video'),
        timestamp: vid.timestamp + delta,
        createdAt: now,
        keyframes: (vid.keyframes ?? []).map((k: MediaKeyframe) => ({ ...k, id: generateId('kf') })),
      })
    )

    set((s: ManifestStore) => {
      const rowsInSlice = new Set(slice.map((v) => v.row))
      const selectedIds = new Set(slice.map((v) => v.id))
      const nextVideos = s.videos
        .map((v) => {
          if (!rowsInSlice.has(v.row)) return v
          if (selectedIds.has(v.id)) return v
          if (v.timestamp < blockEnd) return v
          return v.copy({ timestamp: v.timestamp + delta })
        })
        .concat(newItems)
      return { videos: nextVideos, images: s.images, texts: s.texts, audios: s.audios }
    })

    set({ playbackTime: blockEnd })
    get().pushHistory()
  },
})
