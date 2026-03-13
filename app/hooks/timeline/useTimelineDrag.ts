import { useState, useCallback, useRef, useEffect } from 'react'
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import { useAudioStore } from '@/app/stores/audioStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'

type TrimHandle = 'start' | 'end' | null

interface UseTimelineDragProps {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  totalDuration: number
  effectivePadding: number
  timelineRowRef: React.RefObject<HTMLDivElement>
  setIsPlaying: (playing: boolean) => void
  trimVideo: (id: string, start: number, end: number, ts?: number) => void
  updateImage: (id: string, updates: Partial<ImageClass>) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  updateText: (id: string, updates: Partial<TextClass>) => void
  trimAudio: (id: string, start: number, end: number, ts?: number) => void
  pushHistory: () => void
}

export function useTimelineDrag({
  videos,
  images,
  texts,
  audios,
  totalDuration,
  effectivePadding,
  timelineRowRef,
  setIsPlaying,
  trimVideo,
  updateImage,
  updateVideo,
  updateText,
  trimAudio,
  pushHistory,
}: UseTimelineDragProps) {
  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [audioTrimDragging, setAudioTrimDragging] = useState<{ audioId: string; handle: 'start' | 'end' } | null>(null)
  const [audioBodyDragging, setAudioBodyDragging] = useState<{ audioId: string } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const [overlayVideoDragging, setOverlayVideoDragging] = useState<{ videoId: string } | null>(null)
  const [textDragging, setTextDragging] = useState<{ textId: string; handle: 'move' | 'start' | 'end' } | null>(null)

  const trimStartRef = useRef<any>(null)
  const audioTrimRef = useRef<any>(null)
  const audioBodyDragRef = useRef<any>(null)
  const imageDragRef = useRef<any>(null)
  const overlayVideoDragRef = useRef<any>(null)
  const textDragRef = useRef<any>(null)

  const handleTrimStart = useCallback((videoId: string, handle: TrimHandle, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    setTrimDragging({ videoId, handle })
    trimStartRef.current = {
      trimStart: video.trimStart,
      trimEnd: video.trimEnd,
      initialTimestamp: video.timestamp,
      originalDuration: video.originalDuration ?? video.duration ?? 0,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
    setIsPlaying(false)
  }, [videos, totalDuration, effectivePadding, setIsPlaying, timelineRowRef])

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimDragging || !timelineRowRef.current || !trimStartRef.current) return
    const video = videos.find((v) => v.id === trimDragging.videoId)
    if (!video) return
    const { originalDuration, trimStart: initialTrimStart, trimEnd: initialTrimEnd, initialTimestamp, initialMouseX, timelineWidth, totalWithPadding } = trimStartRef.current
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalWithPadding
    const snapThreshold = 0.15
    const playbackSpeed = video.playbackSpeed ?? 1
    const playbackTime = useManifestStore.getState().playbackTime
    const localPlaybackInVideo = playbackTime - initialTimestamp + initialTrimStart

    if (trimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime * playbackSpeed
      if (Math.abs(newTrimStart - localPlaybackInVideo) < snapThreshold) {
        newTrimStart = localPlaybackInVideo
      } else {
        const globalLeftEdge = initialTimestamp + (newTrimStart - initialTrimStart) / playbackSpeed
        const snapped = snapToMarkers(globalLeftEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalLeftEdge) newTrimStart = initialTrimStart + (snapped - initialTimestamp) * playbackSpeed
      }
      newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - (0.5 * playbackSpeed)))
      const actualSourceDelta = newTrimStart - initialTrimStart
      let newTimestamp = Math.max(0, initialTimestamp + actualSourceDelta / playbackSpeed)
      if (video.row === 0) {
        const allMainItems = [
          ...videos.filter(v => !v.isOverlay).map(v => ({ id: v.id, start: v.timestamp, end: v.timestamp + (v.duration ?? 0) })),
          ...images.filter(img => img.isMainTrack).map(img => ({ id: img.id, start: img.startTime, end: img.endTime }))
        ].sort((a, b) => a.start - b.start)
        const currentIndex = allMainItems.findIndex(item => item.id === video.id)
        const previousItem = currentIndex > 0 ? allMainItems[currentIndex - 1] : null
        newTimestamp = previousItem ? previousItem.end : 0
      }
      trimVideo(trimDragging.videoId, newTrimStart, initialTrimEnd, newTimestamp)
    } else if (trimDragging.handle === 'end') {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime * playbackSpeed
      const playbackEndInOriginal = originalDuration - newTrimEnd
      if (Math.abs(playbackEndInOriginal - localPlaybackInVideo) < snapThreshold) {
        newTrimEnd = originalDuration - localPlaybackInVideo
      } else {
        const globalRightEdge = initialTimestamp + (originalDuration - initialTrimStart - newTrimEnd) / playbackSpeed
        const snapped = snapToMarkers(globalRightEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalRightEdge) newTrimEnd = originalDuration - initialTrimStart - (snapped - initialTimestamp) * playbackSpeed
      }
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - (0.5 * playbackSpeed)))
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
    }
  }, [trimDragging, videos, trimVideo, timelineRowRef])

  const handleTrimEnd = useCallback(() => {
    setTrimDragging(null)
    trimStartRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleAudioTrimStart = useCallback((audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const audioItem = audios.find((a) => a.id === audioId)
    if (!audioItem || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    setAudioTrimDragging({ audioId, handle })
    const playbackSpeed = audioItem.playbackSpeed ?? 1
    audioTrimRef.current = {
      trimStart: audioItem.trimStart,
      trimEnd: audioItem.trimEnd,
      originalDuration: audioItem.originalDuration,
      startTime: audioItem.startTime,
      fileOffset: audioItem.startTime - audioItem.trimStart / playbackSpeed,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
    setIsPlaying(false)
  }, [audios, totalDuration, effectivePadding, setIsPlaying, timelineRowRef])

  const handleAudioTrimMove = useCallback((e: MouseEvent) => {
    if (!audioTrimDragging || !audioTrimRef.current) return
    const { trimStart: initialTrimStart, trimEnd: initialTrimEnd, originalDuration, fileOffset, initialMouseX, timelineWidth, totalWithPadding } = audioTrimRef.current
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalWithPadding
    const minDuration = 0.5
    const audio = audios.find(a => a.id === audioTrimDragging.audioId)
    if (!audio) return
    const playbackSpeed = audio.playbackSpeed ?? 1

    if (audioTrimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime * playbackSpeed
      newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - minDuration))
      let newStartTime = fileOffset + newTrimStart / playbackSpeed
      if (newStartTime < 0) { newStartTime = 0; newTrimStart = -fileOffset * playbackSpeed }
      trimAudio(audioTrimDragging.audioId, newTrimStart, initialTrimEnd, newStartTime)
    } else {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime * playbackSpeed
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - minDuration))
      trimAudio(audioTrimDragging.audioId, initialTrimStart, newTrimEnd)
    }
  }, [audioTrimDragging, audios, trimAudio])

  const handleAudioTrimEnd = useCallback(() => {
    setAudioTrimDragging(null)
    audioTrimRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleAudioBodyDragStart = useCallback((audioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const audioItem = audios.find((a) => a.id === audioId)
    if (!audioItem || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    const activeDur = audioItem.originalDuration - audioItem.trimStart - audioItem.trimEnd
    const effectiveDur = Math.min(activeDur, Math.max(0, totalDuration - audioItem.startTime))
    setAudioBodyDragging({ audioId })
    audioBodyDragRef.current = {
      initialStartTime: audioItem.startTime,
      initialTrimStart: audioItem.trimStart,
      initialOrigDuration: audioItem.originalDuration,
      initialEffectiveDuration: effectiveDur,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
      totalDuration,
    }
    setIsPlaying(false)
  }, [audios, totalDuration, effectivePadding, setIsPlaying, timelineRowRef])

  const handleAudioBodyDragMove = useCallback((e: MouseEvent) => {
    if (!audioBodyDragging || !audioBodyDragRef.current) return
    const { initialStartTime, initialTrimStart, initialOrigDuration, initialEffectiveDuration, initialMouseX, timelineWidth, totalWithPadding, totalDuration: td } = audioBodyDragRef.current
    const mouseDeltaTime = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const newStartTime = Math.max(0, initialStartTime + mouseDeltaTime)
    const newActiveDuration = Math.min(initialEffectiveDuration, Math.max(0, td - newStartTime))
    const newTrimEnd = Math.max(0, initialOrigDuration - initialTrimStart - newActiveDuration)
    trimAudio(audioBodyDragging.audioId, initialTrimStart, newTrimEnd, newStartTime)
  }, [audioBodyDragging, trimAudio])

  const handleAudioBodyDragEnd = useCallback(() => {
    setAudioBodyDragging(null)
    audioBodyDragRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleImageDragStart = useCallback((imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const image = images.find((o) => o.id === imageId)
    if (!image || !timelineRowRef.current) return
    setImageDragging({ imageId, handle })
    imageDragRef.current = {
      initialMouseX: e.clientX,
      initialStartTime: image.startTime,
      initialEndTime: image.endTime,
      timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
    }
  }, [images, timelineRowRef])

  const handleImageDragMove = useCallback((e: MouseEvent) => {
    if (!imageDragging || !imageDragRef.current) return
    const { imageId, handle } = imageDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = imageDragRef.current
    const image = images.find((img) => img.id === imageId)
    if (!image) return
    const totalWithPadding = totalDuration + effectivePadding * 2
    const mouseDelta = e.clientX - initialMouseX
    const timeDelta = (mouseDelta / timelineWidth) * totalWithPadding

    if (handle === 'move') {
      let newStart = initialStartTime + timeDelta
      const dur = initialEndTime - initialStartTime
      if (newStart < 0) newStart = 0
      updateImage(imageId, { startTime: newStart, endTime: newStart + dur })
    } else if (handle === 'start') {
      let newStart = Math.max(0, Math.min(initialStartTime + timeDelta, initialEndTime - 0.5))
      if (image.isMainTrack) {
        const allMainItems = [
          ...videos.filter(v => !v.isOverlay).map(v => ({ id: v.id, start: v.timestamp, end: v.timestamp + (v.duration ?? 0) })),
          ...images.filter(img => img.isMainTrack).map(img => ({ id: img.id, start: img.startTime, end: img.endTime }))
        ].sort((a, b) => a.start - b.start)
        const currentIndex = allMainItems.findIndex(item => item.id === imageId)
        const previousItem = currentIndex > 0 ? allMainItems[currentIndex - 1] : null
        newStart = previousItem ? previousItem.end : 0
      }
      const newDur = Math.max(0.1, initialEndTime - newStart)
      updateImage(imageId, { startTime: newStart, endTime: newStart + newDur })
    } else if (handle === 'end') {
      const newEnd = Math.max(image.startTime + 0.5, initialEndTime + timeDelta)
      updateImage(imageId, { endTime: newEnd })
    }
  }, [imageDragging, images, videos, totalDuration, effectivePadding, updateImage])

  const handleImageDragEnd = useCallback(() => {
    setImageDragging(null)
    imageDragRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleOverlayVideoDragStart = useCallback((videoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    setOverlayVideoDragging({ videoId })
    overlayVideoDragRef.current = {
      initialMouseX: e.clientX,
      initialTimestamp: video.timestamp,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
  }, [videos, totalDuration, effectivePadding, timelineRowRef])

  const handleOverlayVideoDragMove = useCallback((e: MouseEvent) => {
    if (!overlayVideoDragging || !overlayVideoDragRef.current) return
    const { videoId } = overlayVideoDragging
    const { initialMouseX, initialTimestamp, timelineWidth, totalWithPadding } = overlayVideoDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const newTimestamp = Math.max(0, initialTimestamp + timeDelta)
    updateVideo(videoId, { timestamp: newTimestamp })
  }, [overlayVideoDragging, updateVideo])

  const handleOverlayVideoDragEnd = useCallback(() => {
    setOverlayVideoDragging(null)
    overlayVideoDragRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleTextDragStart = useCallback((textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const text = texts.find((t) => t.id === textId)
    if (!text || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    setTextDragging({ textId, handle })
    textDragRef.current = {
      initialMouseX: e.clientX,
      initialStartTime: text.startTime,
      initialEndTime: text.endTime,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
  }, [texts, totalDuration, effectivePadding, timelineRowRef])

  const handleTextDragMove = useCallback((e: MouseEvent) => {
    if (!textDragging || !textDragRef.current) return
    const { textId, handle } = textDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth, totalWithPadding } = textDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const others = texts.filter((t) => t.id !== textId).sort((a, b) => a.startTime - b.startTime)
    const prevEnd = others.filter((t) => t.endTime <= initialStartTime).reduce((max, t) => Math.max(max, t.endTime), 0)
    const nextStart = others.filter((t) => t.startTime >= initialEndTime).reduce((min, t) => Math.min(min, t.startTime), Infinity)

    if (handle === 'move') {
      const dur = initialEndTime - initialStartTime
      let newStart = initialStartTime + timeDelta
      let newEnd = newStart + dur
      if (newStart < prevEnd) { newStart = prevEnd; newEnd = newStart + dur }
      if (newEnd > nextStart) { newEnd = nextStart; newStart = newEnd - dur }
      if (newStart < 0) { newStart = 0; newEnd = dur }
      updateText(textId, { startTime: newStart, endTime: newEnd })
    } else if (handle === 'start') {
      const newStart = Math.max(prevEnd, Math.min(initialStartTime + timeDelta, initialEndTime - 0.1))
      updateText(textId, { startTime: newStart })
    } else if (handle === 'end') {
      const currentStart = texts.find((t) => t.id === textId)?.startTime ?? initialStartTime
      const newEnd = Math.min(nextStart, Math.max(currentStart + 0.1, initialEndTime + timeDelta))
      updateText(textId, { endTime: newEnd })
    }
  }, [textDragging, texts, updateText])

  const handleTextDragEnd = useCallback(() => {
    setTextDragging(null)
    textDragRef.current = null
    pushHistory()
  }, [pushHistory])

  useEffect(() => {
    if (trimDragging) {
      document.addEventListener('mousemove', handleTrimMove)
      document.addEventListener('mouseup', handleTrimEnd)
      return () => {
        document.removeEventListener('mousemove', handleTrimMove)
        document.removeEventListener('mouseup', handleTrimEnd)
      }
    }
  }, [trimDragging, handleTrimMove, handleTrimEnd])

  useEffect(() => {
    if (audioTrimDragging) {
      document.addEventListener('mousemove', handleAudioTrimMove)
      document.addEventListener('mouseup', handleAudioTrimEnd)
      return () => {
        document.removeEventListener('mousemove', handleAudioTrimMove)
        document.removeEventListener('mouseup', handleAudioTrimEnd)
      }
    }
  }, [audioTrimDragging, handleAudioTrimMove, handleAudioTrimEnd])

  useEffect(() => {
    if (audioBodyDragging) {
      document.addEventListener('mousemove', handleAudioBodyDragMove)
      document.addEventListener('mouseup', handleAudioBodyDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleAudioBodyDragMove)
        document.removeEventListener('mouseup', handleAudioBodyDragEnd)
      }
    }
  }, [audioBodyDragging, handleAudioBodyDragMove, handleAudioBodyDragEnd])

  useEffect(() => {
    if (imageDragging) {
      document.addEventListener('mousemove', handleImageDragMove)
      document.addEventListener('mouseup', handleImageDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleImageDragMove)
        document.removeEventListener('mouseup', handleImageDragEnd)
      }
    }
  }, [imageDragging, handleImageDragMove, handleImageDragEnd])

  useEffect(() => {
    if (overlayVideoDragging) {
      document.addEventListener('mousemove', handleOverlayVideoDragMove)
      document.addEventListener('mouseup', handleOverlayVideoDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleOverlayVideoDragMove)
        document.removeEventListener('mouseup', handleOverlayVideoDragEnd)
      }
    }
  }, [overlayVideoDragging, handleOverlayVideoDragMove, handleOverlayVideoDragEnd])

  useEffect(() => {
    if (textDragging) {
      document.addEventListener('mousemove', handleTextDragMove)
      document.addEventListener('mouseup', handleTextDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleTextDragMove)
        document.removeEventListener('mouseup', handleTextDragEnd)
      }
    }
  }, [textDragging, handleTextDragMove, handleTextDragEnd])

  return {
    trimDragging, setTrimDragging,
    audioTrimDragging, setAudioTrimDragging,
    audioBodyDragging, setAudioBodyDragging,
    imageDragging, setImageDragging,
    overlayVideoDragging, setOverlayVideoDragging,
    textDragging, setTextDragging,
    handleTrimStart,
    handleAudioTrimStart,
    handleAudioBodyDragStart,
    handleImageDragStart,
    handleOverlayVideoDragStart,
    handleTextDragStart
  }
}
