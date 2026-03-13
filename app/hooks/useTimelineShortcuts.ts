'use client'

import { useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'

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
  const duplicateItem = useManifestStore((state) => state.duplicateItem)
  const audio = useAudioStore((state) => state.audio)
  const removeAudio = useAudioStore((state) => state.removeAudio)

  const clearSelection = useSelectionStore((state) => state.clearSelection)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (replaceVideoData) return

      const tag = (e.target as HTMLElement).tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      
      if (e.key === 'm' && !isEditing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        if (useAudioStore.getState().analysis) {
          useAudioStore.getState().addUserMark(useManifestStore.getState().playbackTime)
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
        const { selectedVideoId, selectedImageId, selectedTextId, selectedAudioId } = useSelectionStore.getState()
        if (selectedVideoId) removeVideo(selectedVideoId)
        else if (selectedImageId) removeImage(selectedImageId)
        else if (selectedTextId) removeText(selectedTextId)
        else if (selectedAudioId) {
          removeAudioFromManifest(selectedAudioId)
          removeAudio()
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
    removeAudioFromManifest, removeAudio, duplicateItem,
    replaceVideoData, applyZoom, visibleDurationRef, 
    MIN_VISIBLE, MAX_VISIBLE, selectedAudioId, 
    setSelectedAudioId, uploadInputRef, audio
  ])
}
