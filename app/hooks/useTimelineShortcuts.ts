'use client'

import { useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { generateId } from '@/app/lib/idUtils'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'

interface UseTimelineShortcutsProps {
  replaceVideoData: any
  applyZoom: (newVisible: number) => void
  visibleDurationRef: React.MutableRefObject<number>
  MIN_VISIBLE: number
  MAX_VISIBLE: number
  selectedAudioId: string | null
  setSelectedAudioId: (id: string | null) => void
  uploadInputRef: React.RefObject<HTMLInputElement>
}

export function useTimelineShortcuts({
  replaceVideoData,
  applyZoom,
  visibleDurationRef,
  MIN_VISIBLE,
  MAX_VISIBLE,
  selectedAudioId,
  setSelectedAudioId,
  uploadInputRef,
}: UseTimelineShortcutsProps) {
  const undo = useManifestStore((state) => state.undo)
  const redo = useManifestStore((state) => state.redo)
  const removeVideo = useManifestStore((state) => state.removeVideo)
  const removeImage = useManifestStore((state) => state.removeImage)
  const removeText = useManifestStore((state) => state.removeText)
  const removeAudioFromManifest = useManifestStore((state) => state.removeAudio)
  const removeEffect = useManifestStore((state) => state.removeEffect)
  const duplicateItem = useManifestStore((state) => state.duplicateItem)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateImage = useManifestStore((state) => state.updateImage)
  const updateAudio = useManifestStore((state) => state.updateAudio)
  const removeAudio = useAudioStore((state) => state.removeAudio)

  const clearSelection = useSelectionStore((state) => state.clearSelection)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (replaceVideoData) return

      const tag = (e.target as HTMLElement).tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      
      if (e.key === 'm' && !isEditing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const { selectedAudioId, selectedVideoId, selectedImageId } = useSelectionStore.getState()
        const playbackTime = useManifestStore.getState().playbackTime
        if (selectedAudioId) {
          const audios = useManifestStore.getState().audios
          const audio = audios.find((a) => a.id === selectedAudioId)
          if (!audio) return
          const sourceMark = playbackTime - audio.startTime + audio.trimStart
          const minM = audio.trimStart
          const maxM = audio.originalDuration - audio.trimEnd
          if (sourceMark < minM || sourceMark > maxM) return
          if (audio.marks.some((m) => Math.abs(m.t - sourceMark) < 0.05)) return
          const newMarks = [...audio.marks, { id: generateId('amark'), t: sourceMark }].sort((a, b) => a.t - b.t)
          updateAudio(selectedAudioId, { marks: newMarks })
          return
        }
        if (selectedVideoId) {
          const videos = useManifestStore.getState().videos
          const v = videos.find((x) => x.id === selectedVideoId)
          if (!v) return
          const dur = v.duration ?? 0
          const localT = Math.max(0, Math.min(dur, playbackTime - v.timestamp))
          if (v.keyframes.some((k) => Math.abs(k.t - localT) < 0.05)) return
          const snap = resolveMediaKeyframeTransform(v, localT, dur)
          const newKf = {
            id: generateId('kf'),
            t: localT,
            cropSx: snap.cropSx,
            cropSy: snap.cropSy,
            cropSw: snap.cropSw,
            cropSh: snap.cropSh,
            zoomIntensity: snap.zoomIntensity,
          }
          updateVideo(selectedVideoId, { keyframes: [...v.keyframes, newKf].sort((a, b) => a.t - b.t) })
          return
        }
        if (selectedImageId) {
          const images = useManifestStore.getState().images
          const img = images.find((x) => x.id === selectedImageId)
          if (!img) return
          const dur = img.duration
          const localT = Math.max(0, Math.min(dur, playbackTime - img.startTime))
          if (img.keyframes.some((k) => Math.abs(k.t - localT) < 0.05)) return
          const snap = resolveMediaKeyframeTransform(img, localT, dur)
          const newKf = {
            id: generateId('kf'),
            t: localT,
            cropSx: snap.cropSx,
            cropSy: snap.cropSy,
            cropSw: snap.cropSw,
            cropSh: snap.cropSh,
            zoomIntensity: snap.zoomIntensity,
          }
          updateImage(selectedImageId, { keyframes: [...img.keyframes, newKf].sort((a, b) => a.t - b.t) })
        }
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && !isEditing && !e.metaKey && !e.ctrlKey) {
        const st = useSelectionStore.getState()
        if (st.selectedAudioId && st.selectedAudioMarkId) {
          e.preventDefault()
          const a = useManifestStore.getState().audios.find((x) => x.id === st.selectedAudioId)
          if (a) {
            updateAudio(st.selectedAudioId, { marks: a.marks.filter((m) => m.id !== st.selectedAudioMarkId) })
            useSelectionStore.getState().setSelectedAudioMarkId(null)
          }
        } else if (st.selectedKeyframeId && st.selectedVideoId) {
          e.preventDefault()
          const v = useManifestStore.getState().videos.find((x) => x.id === st.selectedVideoId)
          if (v) {
            updateVideo(st.selectedVideoId, { keyframes: v.keyframes.filter((k) => k.id !== st.selectedKeyframeId) })
            useSelectionStore.getState().setSelectedKeyframeId(null)
          }
        } else if (st.selectedKeyframeId && st.selectedImageId) {
          e.preventDefault()
          const img = useManifestStore.getState().images.find((x) => x.id === st.selectedImageId)
          if (img) {
            updateImage(st.selectedImageId, { keyframes: img.keyframes.filter((k) => k.id !== st.selectedKeyframeId) })
            useSelectionStore.getState().setSelectedKeyframeId(null)
          }
        }
      }

      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !isEditing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const st = useSelectionStore.getState()
        const kfId = st.selectedKeyframeId
        if (kfId) {
          const manifest = useManifestStore.getState()
          const delta = e.key === 'ArrowLeft' ? -1 : 1
          if (st.selectedVideoId) {
            const v = manifest.videos.find((x) => x.id === st.selectedVideoId)
            const kfs = v?.keyframes ?? []
            if (v && kfs.length > 1) {
              const sorted = [...kfs].sort((a, b) => a.t - b.t)
              const idx = sorted.findIndex((k) => k.id === kfId)
              const nextIdx = idx + delta
              if (idx >= 0 && nextIdx >= 0 && nextIdx < sorted.length) {
                e.preventDefault()
                e.stopPropagation()
                const next = sorted[nextIdx]
                manifest.setPlaybackTime(v.timestamp + next.t)
                st.selectVideo(st.selectedVideoId, next.id)
              }
            }
          } else if (st.selectedImageId) {
            const img = manifest.images.find((x) => x.id === st.selectedImageId)
            const kfs = img?.keyframes ?? []
            if (img && kfs.length > 1) {
              const sorted = [...kfs].sort((a, b) => a.t - b.t)
              const idx = sorted.findIndex((k) => k.id === kfId)
              const nextIdx = idx + delta
              if (idx >= 0 && nextIdx >= 0 && nextIdx < sorted.length) {
                e.preventDefault()
                e.stopPropagation()
                const next = sorted[nextIdx]
                manifest.setPlaybackTime(img.startTime + next.t)
                st.selectImage(st.selectedImageId, next.id)
              }
            }
          }
        }
      }

      if (!(e.metaKey || e.ctrlKey)) return
      
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        applyZoom(Math.max(MIN_VISIBLE, visibleDurationRef.current * 0.7))
      }
      
      if (e.key === '-') {
        e.preventDefault()
        applyZoom(Math.min(MAX_VISIBLE, visibleDurationRef.current * 1.4))
      }
      
      if (e.key === 'z') {
        e.preventDefault()
        undo()
      }
      
      if (e.key === 'y') {
        e.preventDefault()
        redo()
      }
      
      if (e.key === 'D' && e.shiftKey && !isEditing) {
        e.preventDefault()
        const { selectedVideoId, selectedImageId, selectedTextId } = useSelectionStore.getState()
        if (selectedVideoId) duplicateItem(selectedVideoId)
        else if (selectedImageId) duplicateItem(selectedImageId)
        else if (selectedTextId) duplicateItem(selectedTextId)
      }
      
      if (e.key === 'd' && !isEditing && !e.shiftKey) {
        e.preventDefault()
        const { selectedVideoId, selectedImageId, selectedTextId, selectedAudioId, selectedEffectId } = useSelectionStore.getState()
        if (selectedVideoId) removeVideo(selectedVideoId)
        else if (selectedImageId) removeImage(selectedImageId)
        else if (selectedTextId) removeText(selectedTextId)
        else if (selectedEffectId) removeEffect(selectedEffectId)
        else if (selectedAudioId) {
          removeAudioFromManifest(selectedAudioId)
          const primary = useAudioStore.getState().audio
          if (primary?.id === selectedAudioId) {
            useAudioStore.getState().removeAudio()
          }
          clearSelection()
        }
      }
      
      if (e.key === 'u' && !isEditing) {
        e.preventDefault()
        uploadInputRef.current?.click()
      }
    }
    
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    undo, redo, removeVideo, removeImage, removeText, 
    removeAudioFromManifest, removeAudio, removeEffect, duplicateItem, updateVideo, updateImage, updateAudio,
    replaceVideoData, applyZoom, visibleDurationRef, 
    MIN_VISIBLE, MAX_VISIBLE, selectedAudioId, 
    setSelectedAudioId, uploadInputRef
  ])
}
