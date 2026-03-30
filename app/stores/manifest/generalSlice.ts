import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import { TextClass } from '@/app/models/TextClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore, AspectRatio } from './types'
import { calculateTotalDuration } from '@/app/lib/timeUtils'
import { generateId } from '@/app/lib/idUtils'
import { findFreeVisualOverlayRowFromState } from '@/app/lib/visualOverlayRowScan'

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

    const startTime = type === 'video' ? item.timestamp : item.startTime
    const duration = type === 'audio' ? (item.originalDuration - item.trimStart - item.trimEnd) / (item.playbackSpeed ?? 1) : (item.duration ?? (item.endTime - item.startTime))
    const finalTime = newTime !== undefined ? newTime : startTime

    let resolvedTargetRow = targetRow
    if ((type === 'text' || type === 'effect') && resolvedTargetRow === 0) {
      const segStart = finalTime
      const segEnd = segStart + (item.endTime - item.startTime)
      resolvedTargetRow = findFreeVisualOverlayRowFromState(state, segStart, segEnd)
    }

    if (resolvedTargetRow >= 1) {
      const otherAudios = state.audios.filter((a: any) => a.id !== id && a.row === resolvedTargetRow)
      const otherVisual =
        state.videos.some((v: any) => v.id !== id && v.row === resolvedTargetRow && v.isOverlay) ||
        state.images.some((img: any) => img.id !== id && img.row === resolvedTargetRow && !img.isMainTrack) ||
        state.texts.some((t: any) => t.id !== id && t.row === resolvedTargetRow) ||
        state.effects.some((e: any) => e.id !== id && e.row === resolvedTargetRow)
      if (type === 'audio' && otherVisual) return
      if (
        (type === 'image' || type === 'video' || type === 'text' || type === 'effect') &&
        otherAudios.length > 0
      )
        return
    }

    const oldRow = item.row
    if (oldRow === resolvedTargetRow && newTime === undefined) return

    set((s: ManifestStore) => {
      let nextVideos = [...s.videos]
      let nextImages = [...s.images]
      let nextTexts = [...s.texts]
      let nextAudios = [...s.audios]
      let nextEffects = [...s.effects]

      if (oldRow === 0 && (type === 'video' || (type === 'image' && item.isMainTrack))) {
        const delta = -duration
        nextVideos = nextVideos.map(v => (v.row === 0 && v.timestamp > startTime) ? v.copy({ timestamp: v.timestamp + delta }) : v)
        nextImages = nextImages.map(img => (img.row === 0 && img.startTime > startTime) ? img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta }) : img)
      }

      if (resolvedTargetRow === 0 && (type === 'video' || type === 'image')) {
        const delta = duration
        nextVideos = nextVideos.map(v => (v.row === 0 && v.timestamp >= finalTime) ? v.copy({ timestamp: v.timestamp + delta }) : v)
        nextImages = nextImages.map(img => (img.row === 0 && img.startTime >= finalTime) ? img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta }) : img)
      }

      const updates: any = { row: resolvedTargetRow }
      if (newTime !== undefined) {
        if (type === 'video') updates.timestamp = newTime
        else {
          updates.startTime = newTime
          updates.endTime = newTime + duration
        }
      }
      
      if (type === 'video') updates.isOverlay = resolvedTargetRow !== 0
      if (type === 'image') updates.isMainTrack = resolvedTargetRow === 0
      if (type === 'audio') updates.isOverlay = resolvedTargetRow >= 1

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
      videos: s.videos.map(v => v.row >= atIndex ? v.copy({ row: v.row + 1 }) : v),
      images: s.images.map(img => img.row >= atIndex ? img.copy({ row: img.row + 1 }) : img),
      texts: s.texts.map(t => t.row >= atIndex ? t.copy({ row: t.row + 1 }) : t),
      audios: s.audios.map(a => a.row >= atIndex ? a.copy({ row: a.row + 1 }) : a),
      effects: s.effects.map(e => e.row >= atIndex ? e.copy({ row: e.row + 1 }) : e),
    }))
    get().pushHistory()
  },

  deleteRow: (atIndex: number) => {
    if (atIndex <= 0) return
    set((s: ManifestStore) => {
      return {
        videos: s.videos.map(v => v.row === atIndex ? v.copy({ row: v.row - 1 }) : (v.row > atIndex ? v.copy({ row: v.row - 1 }) : v)),
        images: s.images.map(img => img.row === atIndex ? img.copy({ row: img.row - 1 }) : (img.row > atIndex ? img.copy({ row: img.row - 1 }) : img)),
        texts: s.texts.map(t => t.row === atIndex ? t.copy({ row: t.row - 1 }) : (t.row > atIndex ? t.copy({ row: t.row - 1 }) : t)),
        audios: s.audios.map(a => a.row === atIndex ? a.copy({ row: a.row - 1 }) : (a.row > atIndex ? a.copy({ row: a.row - 1 }) : a)),
        effects: s.effects.map(e => e.row === atIndex ? e.copy({ row: e.row - 1 }) : (e.row > atIndex ? e.copy({ row: e.row - 1 }) : e)),
      }
    })
    get().pushHistory()
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

    // Calculate effective speed for duration purposes
    // For a ramp, the average speed determines the timeline duration for the same source content
    let effectiveSpeed = speed
    if (speedStart !== undefined && speedEnd !== undefined) {
      if (speedEasing === 'ease') {
        // Integral of 3x^2 - 2x^3 from 0 to 1 is 1 - 0.5 = 0.5
        // So average is (speedStart + speedEnd) / 2, same as linear!
        effectiveSpeed = (speedStart + speedEnd) / 2
      } else {
        effectiveSpeed = (speedStart + speedEnd) / 2
      }
    }

    if (video) {
      const currentDuration = video.duration ?? 0
      const sourceDurationToPlay = currentDuration * (video.playbackSpeed ?? 1)
      const origDuration = video.originalDuration ?? currentDuration
      const maxAvailableSource = origDuration - video.trimStart
      
      const newDuration = Math.min(maxAvailableSource / effectiveSpeed, sourceDurationToPlay / effectiveSpeed)
      const newTrimEnd = Math.max(0, origDuration - video.trimStart - (newDuration * effectiveSpeed))

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
      
      const newEffectiveDuration = Math.min(maxAvailableSource / effectiveSpeed, sourceDurationToPlay / effectiveSpeed)
      const newTrimEnd = Math.max(0, origDuration - audio.trimStart - (newEffectiveDuration * effectiveSpeed))

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
      const shiftMainTrack = slice.some((i) => i.row === 0 && i.isMainTrack)
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
        const nextVideos = s.videos.map((v) => {
          if (shiftMainTrack && v.row === 0 && v.timestamp >= blockEnd) {
            return v.copy({ timestamp: v.timestamp + delta })
          }
          return v
        })
        const nextImages = s.images
          .map((img) => {
            if (shiftMainTrack && img.row === 0 && img.startTime >= blockEnd) {
              return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
            }
            return img
          })
          .concat(newItems)
        const nextTexts = s.texts.map((t) => {
          if (shiftMainTrack && t.row === 0 && t.startTime >= blockEnd) {
            return t.copy({ startTime: t.startTime + delta, endTime: t.endTime + delta })
          }
          return t
        })
        const nextAudios = s.audios.map((a) => {
          if (shiftMainTrack && !a.isOverlay && a.startTime >= blockEnd) {
            return a.copy({ startTime: a.startTime + delta, endTime: a.endTime + delta })
          }
          return a
        })
        return { videos: nextVideos, images: nextImages, texts: nextTexts, audios: nextAudios }
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
    const shiftMainTrack = slice.some((v) => v.row === 0)
    const newItems = slice.map((vid) =>
      vid.copy({
        id: generateId('video'),
        timestamp: vid.timestamp + delta,
        createdAt: now,
        keyframes: (vid.keyframes ?? []).map((k: MediaKeyframe) => ({ ...k, id: generateId('kf') })),
      })
    )

    set((s: ManifestStore) => {
      const nextVideos = s.videos
        .map((v) => {
          if (shiftMainTrack && v.row === 0 && v.timestamp >= blockEnd) {
            return v.copy({ timestamp: v.timestamp + delta })
          }
          return v
        })
        .concat(newItems)
      const nextImages = s.images.map((img) => {
        if (shiftMainTrack && img.row === 0 && img.startTime >= blockEnd) {
          return img.copy({ startTime: img.startTime + delta, endTime: img.endTime + delta })
        }
        return img
      })
      const nextTexts = s.texts.map((t) => {
        if (shiftMainTrack && t.row === 0 && t.startTime >= blockEnd) {
          return t.copy({ startTime: t.startTime + delta, endTime: t.endTime + delta })
        }
        return t
      })
      const nextAudios = s.audios.map((a) => {
        if (shiftMainTrack && !a.isOverlay && a.startTime >= blockEnd) {
          return a.copy({ startTime: a.startTime + delta, endTime: a.endTime + delta })
        }
        return a
      })
      return { videos: nextVideos, images: nextImages, texts: nextTexts, audios: nextAudios }
    })

    set({ playbackTime: blockEnd })
    get().pushHistory()
  },
})
