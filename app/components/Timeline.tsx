'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { exportVideo, downloadBlob, ExportProgress } from '@/app/lib/videoExporter'
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import { resolveVideoDuration, toMono, computeImageDimensions, generateVideoThumbnails } from '@/app/lib/mediaUtils'
import { drawAudioGraph } from '@/app/lib/drawAudioGraph'
import styles from './Timeline.module.css'

type TrimHandle = 'start' | 'end' | null

export default function Timeline() {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)
  const addVideo = useManifestStore((state) => state.addVideo)
  const removeVideo = useManifestStore((state) => state.removeVideo)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const addImage = useManifestStore((state) => state.addImage)
  const removeImage = useManifestStore((state) => state.removeImage)
  const updateImage = useManifestStore((state) => state.updateImage)
  const addText = useManifestStore((state) => state.addText)
  const updateText = useManifestStore((state) => state.updateText)
  const removeText = useManifestStore((state) => state.removeText)
  const splitText = useManifestStore((state) => state.splitText)
  const replaceTargetId = useManifestStore((state) => state.replaceTargetId)
  const setReplaceTargetId = useManifestStore((state) => state.setReplaceTargetId)
  const setPendingPrompt = useManifestStore((state) => state.setPendingPrompt)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const playbackRate = useManifestStore((state) => state.playbackRate)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const setPlaybackRate = useManifestStore((state) => state.setPlaybackRate)
  const getTotalDuration = useManifestStore((state) => state.getTotalDuration)
  const trimVideo = useManifestStore((state) => state.trimVideo)
  const splitVideo = useManifestStore((state) => state.splitVideo)
  const splitImage = useManifestStore((state) => state.splitImage)
  const replaceImageSource = useManifestStore((state) => state.replaceImageSource)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const bulkUpdateMainTrackItems = useManifestStore((state) => state.bulkUpdateMainTrackItems)
  const undo = useManifestStore((state) => state.undo)
  const redo = useManifestStore((state) => state.redo)
  const historyIndex = useManifestStore((state) => state.historyIndex)
  const historyLength = useManifestStore((state) => state.history.length)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const audioAnalysis = useAudioStore((state) => state.analysis)
  const isAnalyzing = useAudioStore((state) => state.isAnalyzing)
  const setAudioAnalysis = useAudioStore((state) => state.setAnalysis)
  const setIsAnalyzing = useAudioStore((state) => state.setIsAnalyzing)
  const audio = useAudioStore((state) => state.audio)
  const setAudio = useAudioStore((state) => state.setAudio)
  const removeAudio = useAudioStore((state) => state.removeAudio)
  const addAudioToManifest = useManifestStore((state) => state.addAudio)
  const removeAudioFromManifest = useManifestStore((state) => state.removeAudio)
  const audioUrl = useAudioStore((state) => state.audioUrl)
  const userMarks = useAudioStore((state) => state.userMarks)
  const addUserMark = useAudioStore((state) => state.addUserMark)
  const clearUserMarks = useAudioStore((state) => state.clearUserMarks)
  const audioCanvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const overlayVideoInputRef = useRef<HTMLInputElement>(null)
  const replaceImageInputRef = useRef<HTMLInputElement>(null)
  const [replaceImageTargetId, setReplaceImageTargetId] = useState<string | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [isAudioSelected, setIsAudioSelected] = useState(false)
  const snapStateRef = useRef<{ dropTime: number } | null>(null)
  const prevRawTimeRef = useRef<number | null>(null)
  const lastReleasedDropRef = useRef<number | null>(null)
  const scrollGestureActiveRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [videoThumbnails, setVideoThumbnails] = useState<Map<string, string[]>>(new Map())
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const [overlayVideoDragging, setOverlayVideoDragging] = useState<{ videoId: string } | null>(null)
  const [textDragging, setTextDragging] = useState<{ textId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const trimStartRef = useRef<{
    trimStart: number
    trimEnd: number
    originalDuration: number
    initialMouseX: number
    timelineWidth: number
  } | null>(null)
  const imageDragRef = useRef<{
    initialMouseX: number
    initialStartTime: number
    initialEndTime: number
    timelineWidth: number
    initialTotalDuration: number
    otherMainImages: Array<{ id: string; startTime: number; endTime: number }>
    mainVideos: Array<{ id: string; timestamp: number; duration: number }>
  } | null>(null)
  const overlayVideoDragRef = useRef<{
    initialMouseX: number
    initialTimestamp: number
    timelineWidth: number
  } | null>(null)
  const textDragRef = useRef<{
    initialMouseX: number
    initialStartTime: number
    initialEndTime: number
    timelineWidth: number
  } | null>(null)
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const totalDuration = getTotalDuration()

  const MIN_VISIBLE = 0.5
  const MAX_VISIBLE = 120
  const [visibleDuration, setVisibleDuration] = useState(8)
  const effectivePadding = visibleDuration / 2
  const visibleDurationRef = useRef(8)
  const totalTimelineWidth = totalDuration > 0 ? ((totalDuration + effectivePadding * 2) / visibleDuration) * 100 : 100

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getContentPosition = (time: number) => {
    const timeWithPadding = time + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    if (totalWithPadding === 0) return 0
    return (timeWithPadding / totalWithPadding) * 100
  }

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || isPlaying) return
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    const scrollLeft = container.scrollLeft

    const centerScrollPosition = scrollLeft + (containerWidth / 2)
    const scrollPercent = scrollableWidth > 0 ? centerScrollPosition / scrollableWidth : 0
    const totalWithPadding = totalDuration + effectivePadding * 2
    const timeWithPadding = scrollPercent * totalWithPadding
    let newTime = Math.max(0, Math.min(totalDuration, timeWithPadding - effectivePadding))

    const rawTime = newTime

    const isNewGesture = !scrollGestureActiveRef.current
    scrollGestureActiveRef.current = true
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    scrollEndTimerRef.current = setTimeout(() => {
      scrollGestureActiveRef.current = false
    }, 150)

    if (isAudioSelected && audioAnalysis && userMarks.length > 0) {
      if (snapStateRef.current) {
        if (isNewGesture) {
          lastReleasedDropRef.current = snapStateRef.current.dropTime
          snapStateRef.current = null
        } else {
          newTime = snapStateRef.current.dropTime
          const snapTimeWithPadding = snapStateRef.current.dropTime + effectivePadding
          const targetSnapLeft = totalWithPadding > 0
            ? (scrollableWidth * (snapTimeWithPadding / totalWithPadding)) - (containerWidth / 2)
            : 0
          isScrollingProgrammatically.current = true
          container.scrollLeft = Math.max(0, targetSnapLeft)
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
          scrollTimeoutRef.current = setTimeout(() => {
            isScrollingProgrammatically.current = false
          }, 50)
        }
      }

      if (!snapStateRef.current) {
        const prev = prevRawTimeRef.current
        prevRawTimeRef.current = rawTime
        if (lastReleasedDropRef.current !== null && Math.abs(rawTime - lastReleasedDropRef.current) > 0.3) {
          lastReleasedDropRef.current = null
        }
        if (prev !== null) {
          const lookahead = 0.15
          const direction = rawTime >= prev ? 1 : -1
          const lo = Math.min(prev, rawTime) - (direction < 0 ? lookahead : 0)
          const hi = Math.max(prev, rawTime) + (direction > 0 ? lookahead : 0)
          let crossed: number | null = null
          let crossedDist = Infinity
          for (const drop of userMarks) {
            if (drop === lastReleasedDropRef.current) continue
            if (drop > lo && drop <= hi) {
              const d = Math.abs(drop - prev)
              if (d < crossedDist) { crossedDist = d; crossed = drop }
            }
          }
          if (crossed !== null) {
            snapStateRef.current = { dropTime: crossed }
            newTime = crossed
            prevRawTimeRef.current = crossed
            const snapTimeWithPadding = crossed + effectivePadding
            const targetSnapLeft = totalWithPadding > 0
              ? (scrollableWidth * (snapTimeWithPadding / totalWithPadding)) - (containerWidth / 2)
              : 0
            isScrollingProgrammatically.current = true
            container.scrollLeft = Math.max(0, targetSnapLeft)
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
            scrollTimeoutRef.current = setTimeout(() => {
              isScrollingProgrammatically.current = false
            }, 50)
          }
        }
      } else {
        prevRawTimeRef.current = rawTime
      }
    } else {
      snapStateRef.current = null
      prevRawTimeRef.current = rawTime
    }

    setPlaybackTime(newTime)
  }, [isPlaying, totalDuration, effectivePadding, setPlaybackTime, isAudioSelected, audioAnalysis, userMarks])

  useEffect(() => {
    if (isAudioSelected) {
      prevRawTimeRef.current = playbackTime
    } else {
      snapStateRef.current = null
      prevRawTimeRef.current = null
      lastReleasedDropRef.current = null
      scrollGestureActiveRef.current = false
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    }
  }, [isAudioSelected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrollContainerRef.current) return

    isScrollingProgrammatically.current = true

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    
    const timeWithPadding = playbackTime + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    const targetScrollPercent = totalWithPadding > 0 ? timeWithPadding / totalWithPadding : 0
    const targetScrollLeft = (scrollableWidth * targetScrollPercent) - (containerWidth / 2)
    
    container.scrollLeft = Math.max(0, targetScrollLeft)
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 50)
  }, [playbackTime, totalDuration, effectivePadding])

  useEffect(() => {
    const uniqueUrls = new Set(videos.map((v) => v.url).filter(Boolean) as string[])

    uniqueUrls.forEach(async (url) => {
      if (videoThumbnails.has(url)) return

      const thumbs = await generateVideoThumbnails(url)
      if (thumbs && thumbs.length > 0) {
        setVideoThumbnails((prev) => {
          const next = new Map(prev)
          next.set(url, thumbs)
          return next
        })
      }
    })
  }, [videos, videoThumbnails])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = URL.createObjectURL(file)
        const duration = await resolveVideoDuration(blobUrl)
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        addVideo(new VideoClass(id, title, blobUrl, duration))
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const start = playbackTime
        const end = start + 5
        const { x, y, width, height } = await computeImageDimensions(url, aspectRatio, true)
        addImage(new ImageClass(
          `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file.name,
          url,
          start,
          end,
          x, y, width, height, 1,
          undefined,
          true,
        ))
      } else if (file.type.startsWith('audio/')) {
        const blobUrl = URL.createObjectURL(file)
        const audioId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        setIsAnalyzing(true)
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioInstance = new AudioClass(audioId, file.name, blobUrl, 0, audioBuffer.duration)
          setAudio(audioInstance)
          addAudioToManifest(audioInstance)
          const mono = toMono(audioBuffer)
          const worker = new Worker(
            new URL('../workers/audioAnalysis.worker.ts', import.meta.url)
          )
          worker.onmessage = (ev) => {
            setAudioAnalysis(ev.data)
            worker.terminate()
          }
          worker.onerror = () => {
            setIsAnalyzing(false)
            worker.terminate()
          }
          worker.postMessage({ samples: mono, sampleRate: audioBuffer.sampleRate }, [mono.buffer])
        } catch {
          setIsAnalyzing(false)
        }
      }
    }

    e.target.value = ''
  }


  const handleOverlayVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = URL.createObjectURL(file)
        const duration = await resolveVideoDuration(blobUrl)
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        addVideo(new VideoClass(id, title, blobUrl, duration, 0, undefined, undefined, undefined, 0, 0, undefined, true))
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const start = playbackTime
        const end = start + 5
        const { x, y, width, height } = await computeImageDimensions(url, aspectRatio, false)
        addImage(new ImageClass(
          `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file.name,
          url,
          start,
          end,
          x, y, width, height, 1,
          undefined,
          false,
        ))
      }
    }
    e.target.value = ''
  }

  const handleReplaceImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !replaceImageTargetId || !file.type.startsWith('image/')) return
    const newUrl = URL.createObjectURL(file)
    const newName = file.name
    replaceImageSource(replaceImageTargetId, newUrl, newName)
    setReplaceImageTargetId(null)
    e.target.value = ''
  }

  const handleExport = async () => {
    const hasMainContent = videos.filter((v) => !v.isOverlay).length > 0 || images.filter((img) => img.isMainTrack).length > 0
    if (isExporting || !hasMainContent) return

    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    try {
      const blob = await exportVideo(videos, aspectRatio, setExportProgress, images, audioUrl, texts)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadBlob(blob, `mango-export-${timestamp}.mp4`)
    } catch (error) {
      setExportProgress({
        phase: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Export failed',
      })
    } finally {
      setIsExporting(false)
      setTimeout(() => setExportProgress(null), 3000)
    }
  }

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
      originalDuration: video.originalDuration ?? video.duration ?? 0,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
    }
    setIsPlaying(false)
  }, [videos, setIsPlaying])

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimDragging || !timelineRowRef.current || !trimStartRef.current) return

    const video = videos.find((v) => v.id === trimDragging.videoId)
    if (!video) return

    const { originalDuration, trimStart: initialTrimStart, trimEnd: initialTrimEnd, initialMouseX, timelineWidth } = trimStartRef.current
    
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalDuration
    
    const minDuration = 0.5
    const snapThreshold = 0.15

    const currentPlaybackTime = useManifestStore.getState().playbackTime
    const localPlaybackInVideo = currentPlaybackTime - video.timestamp + video.trimStart

    if (trimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime
      
      if (Math.abs(newTrimStart - localPlaybackInVideo) < snapThreshold) {
        newTrimStart = localPlaybackInVideo
      } else {
        const globalLeftEdge = video.timestamp + (newTrimStart - initialTrimStart)
        const snapped = snapToMarkers(globalLeftEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalLeftEdge) {
          newTrimStart = initialTrimStart + (snapped - video.timestamp)
        }
      }

      const maxTrimStart = originalDuration - initialTrimEnd - minDuration
      newTrimStart = Math.max(0, Math.min(newTrimStart, maxTrimStart))
      
      const frameTimeInOriginal = localPlaybackInVideo
      
      trimVideo(trimDragging.videoId, newTrimStart, initialTrimEnd)
      
      const updatedVideo = useManifestStore.getState().videos.find((v) => v.id === trimDragging.videoId)
      if (updatedVideo && frameTimeInOriginal >= newTrimStart && frameTimeInOriginal <= originalDuration - initialTrimEnd) {
        const newPlaybackTime = updatedVideo.timestamp + (frameTimeInOriginal - newTrimStart)
        setPlaybackTime(Math.max(0, newPlaybackTime))
      }
    } else if (trimDragging.handle === 'end') {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime
      
      const playbackEndInOriginal = originalDuration - newTrimEnd
      if (Math.abs(playbackEndInOriginal - localPlaybackInVideo) < snapThreshold) {
        newTrimEnd = originalDuration - localPlaybackInVideo
      } else {
        const globalRightEdge = video.timestamp + originalDuration - initialTrimStart - newTrimEnd
        const snapped = snapToMarkers(globalRightEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalRightEdge) {
          newTrimEnd = originalDuration - initialTrimStart - (snapped - video.timestamp)
        }
      }
      
      const maxTrimEnd = originalDuration - initialTrimStart - minDuration
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, maxTrimEnd))
      
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
    }
  }, [trimDragging, videos, totalDuration, trimVideo, setPlaybackTime])

  const handleTrimEnd = useCallback(() => {
    setTrimDragging(null)
    trimStartRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleImageDragStart = (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
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
      initialTotalDuration: totalDuration,
      otherMainImages: images
        .filter((img) => img.isMainTrack && img.id !== imageId)
        .map((img) => ({ id: img.id, startTime: img.startTime, endTime: img.endTime })),
      mainVideos: videos
        .filter((v) => !v.isOverlay)
        .map((v) => ({ id: v.id, timestamp: v.timestamp, duration: v.duration ?? 0 })),
    }
  }

  const handleImageDragMove = useCallback((e: MouseEvent) => {
    if (!imageDragging || !imageDragRef.current) return

    const { imageId, handle } = imageDragging
    const {
      initialMouseX, initialStartTime, initialEndTime,
      timelineWidth, initialTotalDuration,
      otherMainImages, mainVideos,
    } = imageDragRef.current

    const image = images.find((img) => img.id === imageId)
    const isMainTrack = image?.isMainTrack ?? false

    const totalWithPadding = initialTotalDuration + effectivePadding * 2
    const mouseDelta = e.clientX - initialMouseX
    const timeDelta = (mouseDelta / timelineWidth) * totalWithPadding

    if (handle === 'move') {
      let newStartTime = initialStartTime + timeDelta
      let newEndTime = initialEndTime + timeDelta
      const duration = initialEndTime - initialStartTime

      if (newStartTime < 0) { newStartTime = 0; newEndTime = duration }

      updateImage(imageId, { startTime: newStartTime, endTime: newEndTime })
      return
    }

    if (handle === 'start') {
      const rawNewStart = initialStartTime + timeDelta
      const newStartTime = Math.max(0, Math.min(rawNewStart, initialEndTime - 0.5))
      const actualDelta = newStartTime - initialStartTime

      if (isMainTrack && (otherMainImages.length > 0 || mainVideos.length > 0)) {
        const imagePatches = [
          { id: imageId, startTime: newStartTime, endTime: initialEndTime },
          ...otherMainImages
            .filter((s) => s.endTime <= initialStartTime)
            .map((s) => ({
              id: s.id,
              startTime: Math.max(0, s.startTime + actualDelta),
              endTime: Math.max(Math.max(0, s.startTime + actualDelta) + 0.1, s.endTime + actualDelta),
            })),
        ]
        const videoPatches = mainVideos
          .filter((s) => s.timestamp + s.duration <= initialStartTime)
          .map((s) => ({ id: s.id, timestamp: Math.max(0, s.timestamp + actualDelta) }))
        bulkUpdateMainTrackItems(imagePatches, videoPatches)
      } else {
        updateImage(imageId, { startTime: newStartTime })
      }
      return
    }

    if (handle === 'end') {
      const newEndTime = Math.max(initialStartTime + 0.5, initialEndTime + timeDelta)
      const actualDelta = newEndTime - initialEndTime

      if (isMainTrack && (otherMainImages.length > 0 || mainVideos.length > 0)) {
        const imagePatches = [
          { id: imageId, startTime: initialStartTime, endTime: newEndTime },
          ...otherMainImages
            .filter((s) => s.startTime >= initialEndTime)
            .map((s) => ({
              id: s.id,
              startTime: s.startTime + actualDelta,
              endTime: s.endTime + actualDelta,
            })),
        ]
        const videoPatches = mainVideos
          .filter((s) => s.timestamp >= initialEndTime)
          .map((s) => ({ id: s.id, timestamp: s.timestamp + actualDelta }))
        bulkUpdateMainTrackItems(imagePatches, videoPatches)
      } else {
        updateImage(imageId, { endTime: newEndTime })
      }
    }
  }, [imageDragging, images, updateImage, bulkUpdateMainTrackItems])

  const handleImageDragEnd = useCallback(() => {
    setImageDragging(null)
    imageDragRef.current = null
    pushHistory()
  }, [pushHistory])

  useEffect(() => {
    if (!imageDragging) return

    document.addEventListener('mousemove', handleImageDragMove)
    document.addEventListener('mouseup', handleImageDragEnd)

    return () => {
      document.removeEventListener('mousemove', handleImageDragMove)
      document.removeEventListener('mouseup', handleImageDragEnd)
    }
  }, [imageDragging, handleImageDragMove, handleImageDragEnd])

  const handleOverlayVideoDragStart = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return
    setOverlayVideoDragging({ videoId })
    overlayVideoDragRef.current = {
      initialMouseX: e.clientX,
      initialTimestamp: video.timestamp,
      timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
    }
  }

  const handleOverlayVideoDragMove = useCallback((e: MouseEvent) => {
    if (!overlayVideoDragging || !overlayVideoDragRef.current) return
    const { videoId } = overlayVideoDragging
    const { initialMouseX, initialTimestamp, timelineWidth } = overlayVideoDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalDuration
    const newTimestamp = Math.max(0, Math.min(initialTimestamp + timeDelta, totalDuration))
    updateVideo(videoId, { timestamp: newTimestamp })
  }, [overlayVideoDragging, totalDuration, updateVideo])

  const handleOverlayVideoDragEnd = useCallback(() => {
    setOverlayVideoDragging(null)
    overlayVideoDragRef.current = null
    pushHistory()
  }, [pushHistory])

  useEffect(() => {
    if (!overlayVideoDragging) return
    document.addEventListener('mousemove', handleOverlayVideoDragMove)
    document.addEventListener('mouseup', handleOverlayVideoDragEnd)
    return () => {
      document.removeEventListener('mousemove', handleOverlayVideoDragMove)
      document.removeEventListener('mouseup', handleOverlayVideoDragEnd)
    }
  }, [overlayVideoDragging, handleOverlayVideoDragMove, handleOverlayVideoDragEnd])

  const handleAddText = () => {
    const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startTime = texts.reduce((max, t) => Math.max(max, t.endTime), playbackTime)
    addText(new TextClass(id, 'Text', startTime, startTime + 5))
  }

  const handleTextDragStart = (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const text = texts.find((t) => t.id === textId)
    if (!text || !timelineRowRef.current) return
    setTextDragging({ textId, handle })
    textDragRef.current = {
      initialMouseX: e.clientX,
      initialStartTime: text.startTime,
      initialEndTime: text.endTime,
      timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
    }
  }

  const handleTextDragMove = useCallback((e: MouseEvent) => {
    if (!textDragging || !textDragRef.current) return
    const { textId, handle } = textDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = textDragRef.current
    const totalWithPadding = totalDuration + effectivePadding * 2
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
  }, [textDragging, totalDuration, updateText, texts])

  const handleTextDragEnd = useCallback(() => {
    setTextDragging(null)
    textDragRef.current = null
    pushHistory()
  }, [pushHistory])

  useEffect(() => {
    if (!textDragging) return
    document.addEventListener('mousemove', handleTextDragMove)
    document.addEventListener('mouseup', handleTextDragEnd)
    return () => {
      document.removeEventListener('mousemove', handleTextDragMove)
      document.removeEventListener('mouseup', handleTextDragEnd)
    }
  }, [textDragging, handleTextDragMove, handleTextDragEnd])

  useEffect(() => {
    if (!trimDragging) return

    document.addEventListener('mousemove', handleTrimMove)
    document.addEventListener('mouseup', handleTrimEnd)

    return () => {
      document.removeEventListener('mousemove', handleTrimMove)
      document.removeEventListener('mouseup', handleTrimEnd)
    }
  }, [trimDragging, handleTrimMove, handleTrimEnd])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (e.key === 'm' && !isEditing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        if (useAudioStore.getState().analysis) {
          useAudioStore.getState().addUserMark(useManifestStore.getState().playbackTime)
        }
      }
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(Math.max(MIN_VISIBLE, visibleDurationRef.current * 0.7)) }
      if (e.key === '-') { e.preventDefault(); applyZoom(Math.min(MAX_VISIBLE, visibleDurationRef.current * 1.4)) }
      if (e.key === 'z') { e.preventDefault(); undo() }
      if (e.key === 'y') { e.preventDefault(); redo() }
      if (e.key === 'd' && !isEditing) {
        e.preventDefault()
        const { selectedVideoId, selectedImageId, selectedTextId } = useSelectionStore.getState()
        if (selectedVideoId) removeVideo(selectedVideoId)
        else if (selectedImageId) removeImage(selectedImageId)
        else if (selectedTextId) removeText(selectedTextId)
        else if (isAudioSelected) { if (audio) removeAudioFromManifest(audio.id); removeAudio(); setIsAudioSelected(false) }
      }
      if (e.key === 'u' && !isEditing) {
        e.preventDefault()
        uploadInputRef.current?.click()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo, removeVideo, removeImage])

  useEffect(() => { visibleDurationRef.current = visibleDuration }, [visibleDuration])

  const applyZoom = useCallback((newVisible: number) => {
    visibleDurationRef.current = newVisible
    isScrollingProgrammatically.current = true
    setVisibleDuration(newVisible)
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return
      const newPadding = newVisible / 2
      const playTime = useManifestStore.getState().playbackTime
      const dur = getTotalDuration()
      const totalWithPadding = dur + newPadding * 2
      const pct = totalWithPadding > 0 ? (playTime + newPadding) / totalWithPadding : 0
      container.scrollLeft = Math.max(0, pct * container.scrollWidth - container.clientWidth / 2)
      setTimeout(() => { isScrollingProgrammatically.current = false }, 50)
    })
  }, [getTotalDuration])

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const container = scrollContainerRef.current
      if (!container || !container.contains(e.target as Node)) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = Math.exp(e.deltaY * 0.005)
        const next = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, visibleDurationRef.current * factor))
        applyZoom(next)
      } else if (useManifestStore.getState().isPlaying) {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [applyZoom])

  useEffect(() => {
    const canvas = audioCanvasRef.current
    if (!canvas || !audioAnalysis) return
    drawAudioGraph(canvas, audioAnalysis, totalDuration, effectivePadding)
  }, [audioAnalysis, totalDuration])

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <input
          ref={uploadInputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={overlayVideoInputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          onChange={handleOverlayVideoSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={replaceImageInputRef}
          type="file"
          accept="image/*"
          onChange={handleReplaceImageSelect}
          style={{ display: 'none' }}
        />
        {videos.length === 0 && images.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No content yet. Generate a video in the chat or</p>
            <button
              className={styles.uploadVideoButton}
              onClick={() => uploadInputRef.current?.click()}
            >
              upload a file
            </button>
          </div>
        ) : (
          <div className={styles.timelineWrapper}>
            <div className={styles.playbackControls}>
              <button
                className={styles.historyButton}
                onClick={undo}
                disabled={historyIndex <= 0}
                title="Undo (Cmd+Z)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" />
                  <path d="M3 13C5 8 9 5 14 5a9 9 0 0 1 0 18c-4 0-7.5-2-9-5" />
                </svg>
              </button>
              <button
                className={styles.historyButton}
                onClick={redo}
                disabled={historyIndex >= historyLength - 1}
                title="Redo (Cmd+Y)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7v6h-6" />
                  <path d="M21 13c-2 5-6 8-11 8a9 9 0 0 1 0-18c4 0 7.5 2 9 5" />
                </svg>
              </button>
              <button
                className={styles.playButton}
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={isExporting}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className={styles.speedButton}
                onClick={() => {
                  const steps = [0.25, 0.5, 1, 1.5, 2]
                  const idx = steps.indexOf(playbackRate)
                  setPlaybackRate(steps[(idx + 1) % steps.length])
                }}
                title="Playback speed"
              >
                {playbackRate === 1 ? '1×' : `${playbackRate}×`}
              </button>
              <span className={styles.timeDisplay}>
                {formatTime(playbackTime)} / {formatTime(totalDuration)}
              </span>
              <button
                className={styles.addOverlayButton}
                onClick={() => uploadInputRef.current?.click()}
                title="Upload video or image (Cmd+U)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <button
                className={styles.addOverlayButton}
                onClick={() => overlayVideoInputRef.current?.click()}
                title="Add video overlay"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                  <line x1="12" y1="9" x2="12" y2="15" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                </svg>
              </button>
              <button
                className={styles.deleteButton}
                onClick={() => {
                  if (selectedVideoId) removeVideo(selectedVideoId)
                  else if (selectedImageId) removeImage(selectedImageId)
                  else if (selectedTextId) removeText(selectedTextId)
                  else if (isAudioSelected) { if (audio) removeAudioFromManifest(audio.id); removeAudio(); setIsAudioSelected(false) }
                }}
                disabled={!selectedVideoId && !selectedImageId && !selectedTextId && !isAudioSelected}
                title="Delete selected (Cmd+D)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
              <button
                className={styles.splitButton}
                onClick={() => {
                  if (selectedVideoId) splitVideo(selectedVideoId, playbackTime)
                  else if (selectedImageId) splitImage(selectedImageId, playbackTime)
                  else if (selectedTextId) splitText(selectedTextId, playbackTime)
                }}
                disabled={(() => {
                  if (selectedVideoId) {
                    const v = videos.find((v) => v.id === selectedVideoId)
                    if (!v) return true
                    const local = playbackTime - v.timestamp
                    return local <= 0.05 || local >= (v.duration ?? 0) - 0.05
                  }
                  if (selectedImageId) {
                    const img = images.find((img) => img.id === selectedImageId && img.isMainTrack)
                    if (!img) return true
                    return playbackTime <= img.startTime + 0.05 || playbackTime >= img.endTime - 0.05
                  }
                  if (selectedTextId) {
                    const t = texts.find((t) => t.id === selectedTextId)
                    if (!t) return true
                    return playbackTime <= t.startTime + 0.05 || playbackTime >= t.endTime - 0.05
                  }
                  return true
                })()}
                title="Split at playhead"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3L6 21" />
                  <path d="M18 3L18 21" />
                  <path d="M3 12L21 12" />
                </svg>
              </button>
              <button
                className={styles.addTextButton}
                onClick={handleAddText}
                disabled={videos.filter((v) => !v.isOverlay).length === 0 && images.filter((img) => img.isMainTrack).length === 0}
                title="Add text"
              >
                T
              </button>
              {audioAnalysis && userMarks.length > 0 && (
                <button
                  className={styles.clearMarksButton}
                  onClick={clearUserMarks}
                  title="Clear all manual marks"
                >
                  ✕ {userMarks.length}
                </button>
              )}
              {isAnalyzing && (
                <span className={styles.analyzingBadge}>Analyzing…</span>
              )}
              <button
                className={styles.exportButton}
                onClick={handleExport}
                disabled={isExporting || (videos.filter((v) => !v.isOverlay).length === 0 && images.filter((img) => img.isMainTrack).length === 0)}
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
            {exportProgress && (
              <div className={styles.exportProgress}>
                <div 
                  className={styles.exportProgressBar} 
                  style={{ width: `${exportProgress.progress}%` }}
                />
                <span className={styles.exportProgressText}>{exportProgress.message}</span>
              </div>
            )}
            <div className={styles.timelineRowContainer}>
              <div className={styles.playheadLine} />
              <div ref={scrollContainerRef} className={styles.scrollContainer} onScroll={handleScroll}>
                <div className={styles.timelineContent} style={{ width: `${totalTimelineWidth}%` }}>
                  {(audioAnalysis || isAnalyzing) && (
                    <div
                      className={`${styles.audioRow} ${isAudioSelected ? styles.audioRowSelected : ''}`}
                      onClick={() => setIsAudioSelected((s) => !s)}
                    >
                      {isAnalyzing && (
                        <span className={styles.analyzingBadge}>Analyzing audio…</span>
                      )}
                      {audioAnalysis && (
                        <>
                          <canvas ref={audioCanvasRef} className={styles.audioCanvas} />
                          {userMarks
                            .filter((t) => t >= 0 && t <= audioAnalysis.duration)
                            .map((t, i) => (
                              <div
                                key={`um-${i}`}
                                className={styles.userMarkMarker}
                                style={{ left: `${getContentPosition(t)}%` }}
                                title={`Mark at ${t.toFixed(2)}s`}
                              />
                            ))}
                        </>
                      )}
                    </div>
                  )}
                  {(images.some((img) => !img.isMainTrack) || videos.some((v) => v.isOverlay)) && (
                  <div className={styles.overlayRow}>
                    {images.filter((img) => !img.isMainTrack).map((image) => {
                      const leftPercent = getContentPosition(image.startTime)
                      const widthPercent = totalDuration > 0 ? (image.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
                      const isSelected = selectedImageId === image.id
                      return (
                        <div
                          key={image.id}
                          className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            position: 'absolute',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedImageId(selectedImageId === image.id ? null : image.id)
                            setSelectedVideoId(null)
                          }}
                          onMouseDown={(e) => handleImageDragStart(image.id, 'move', e)}
                        >
                          <div
                            className={styles.overlayHandleStart}
                            onMouseDown={(e) => handleImageDragStart(image.id, 'start', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div
                            className={styles.overlayHandleEnd}
                            onMouseDown={(e) => handleImageDragStart(image.id, 'end', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {isSelected && (
                            <button
                              className={`${styles.replaceButton} ${replaceImageTargetId === image.id ? styles.active : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (replaceImageTargetId === image.id) {
                                  setReplaceImageTargetId(null)
                                } else {
                                  setReplaceImageTargetId(image.id)
                                  replaceImageInputRef.current?.click()
                                }
                              }}
                              title={replaceImageTargetId === image.id ? 'Cancel replace' : 'Replace image source'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                              </svg>
                            </button>
                          )}
                          <div className={styles.overlayBox}>
                            <img src={image.url} alt={image.name} className={styles.overlayThumbnail} />
                            <span className={styles.overlayName}>{image.name}</span>
                          </div>
                        </div>
                      )
                    })}
                    {videos.filter((v) => v.isOverlay).map((video) => {
                      const leftPercent = getContentPosition(video.timestamp)
                      const widthPercent = totalDuration > 0 && video.duration ? (video.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
                      const isSelected = selectedVideoId === video.id
                      return (
                        <div
                          key={video.id}
                          className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedVideoId(selectedVideoId === video.id ? null : video.id)
                            setSelectedImageId(null)
                          }}
                          onMouseDown={(e) => handleOverlayVideoDragStart(video.id, e)}
                        >
                          <div
                            className={styles.overlayHandleStart}
                            onMouseDown={(e) => handleTrimStart(video.id, 'start', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div
                            className={styles.overlayHandleEnd}
                            onMouseDown={(e) => handleTrimStart(video.id, 'end', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className={styles.overlayBox}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                              <polygon points="5,3 19,12 5,21" />
                            </svg>
                            <span className={styles.overlayName}>{video.title}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}
                  {texts.length > 0 && (
                    <div className={styles.textRow}>
                      {texts.map((text) => {
                        const leftPercent = getContentPosition(text.startTime)
                        const widthPercent = totalDuration > 0 ? (text.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
                        const isSelected = selectedTextId === text.id
                        return (
                          <div
                            key={text.id}
                            className={`${styles.overlayItem} ${styles.textItem} ${isSelected ? styles.selected : ''}`}
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTextId(selectedTextId === text.id ? null : text.id)
                              setSelectedVideoId(null)
                              setSelectedImageId(null)
                            }}
                            onMouseDown={(e) => handleTextDragStart(text.id, 'move', e)}
                          >
                            <div
                              className={styles.overlayHandleStart}
                              onMouseDown={(e) => handleTextDragStart(text.id, 'start', e)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div
                              className={styles.overlayHandleEnd}
                              onMouseDown={(e) => handleTextDragStart(text.id, 'end', e)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className={styles.overlayBox}>
                              <span className={styles.overlayName}>{text.content || 'Text'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div ref={timelineRowRef} className={styles.timelineRow}>
                    {videos.filter((v) => !v.isOverlay).map((video) => {
                      const leftPercent = getContentPosition(video.timestamp)
                      const widthPercent = totalDuration > 0 && video.duration ? (video.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
                      const isSelected = selectedVideoId === video.id
                      const isReplaceTarget = replaceTargetId === video.id
                      const hasTrim = video.trimStart > 0 || video.trimEnd > 0
                      return (
                        <div
                          key={video.id}
                          className={`${styles.timelineItem} ${isSelected ? styles.selected : ''} ${hasTrim ? styles.trimmed : ''} ${isReplaceTarget ? styles.replaceTarget : ''}`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            position: 'absolute',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedVideoId(video.id)
                            setSelectedImageId(null)
                          }}
                        >
                      {isSelected && (
                        <>
                          <div
                            className={styles.trimHandleStart}
                            onMouseDown={(e) => handleTrimStart(video.id, 'start', e)}
                          />
                          <div
                            className={styles.trimHandleEnd}
                            onMouseDown={(e) => handleTrimStart(video.id, 'end', e)}
                          />
                          <button
                            className={`${styles.replaceButton} ${isReplaceTarget ? styles.active : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setReplaceTargetId(isReplaceTarget ? null : video.id)
                            }}
                            title={isReplaceTarget ? 'Cancel replace mode' : 'Replace this video'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                            </svg>
                          </button>
                          <button
                            className={`${styles.copyPromptButton} ${!video.prompt ? styles.disabled : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (video.prompt) {
                                setPendingPrompt(video.prompt)
                              }
                            }}
                            title={video.prompt ? 'Use this prompt' : 'No prompt available'}
                            disabled={!video.prompt}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </>
                      )}
                      <div className={styles.videoBox}>
                        <div className={styles.thumbnailStrip}>
                          {(() => {
                            if (!video.url) return null
                            const allThumbs = videoThumbnails.get(video.url)
                            if (!allThumbs || allThumbs.length === 0) return null
                            
                            const startIdx = Math.floor(video.trimStart)
                            const origDuration = video.originalDuration ?? video.duration ?? allThumbs.length
                            const endIdx = Math.ceil(origDuration - video.trimEnd)
                            const thumbs = allThumbs.slice(startIdx, endIdx)
                            
                            if (thumbs.length === 0) return null
                            
                            const thumbWidth = 85
                            const itemWidthPx = (widthPercent / 100) * (scrollContainerRef.current?.scrollWidth || 1000)
                            const totalThumbsWidth = thumbs.length * thumbWidth
                            const repeatCount = Math.max(1, Math.ceil(itemWidthPx / totalThumbsWidth))
                            const repeatedThumbs: string[] = []
                            for (let r = 0; r < repeatCount; r++) {
                              repeatedThumbs.push(...thumbs)
                            }
                            return repeatedThumbs.map((thumb, idx) => (
                              <img
                                key={idx}
                                src={thumb}
                                alt=""
                                className={styles.thumbnail}
                                draggable={false}
                              />
                            ))
                          })()}
                        </div>
                        {(hasTrim || isReplaceTarget) && (
                          <div className={styles.videoOverlayText}>
                            {isReplaceTarget ? (
                              <span className={styles.replaceIndicator}>Will be replaced</span>
                            ) : (
                              <span className={styles.trimBadge}>
                                {video.trimStart.toFixed(1)}s / {video.trimEnd.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                    {images.filter((img) => img.isMainTrack).map((image) => {
                      const leftPercent = getContentPosition(image.startTime)
                      const widthPercent = totalDuration > 0 ? (image.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
                      const isSelected = selectedImageId === image.id
                      const isReplaceTarget = replaceImageTargetId === image.id
                      return (
                        <div
                          key={image.id}
                          className={`${styles.overlayItem} ${isSelected ? styles.selected : ''} ${isReplaceTarget ? styles.replaceTarget : ''}`}
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute', height: '100%' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedImageId(selectedImageId === image.id ? null : image.id)
                            setSelectedVideoId(null)
                          }}
                          onMouseDown={(e) => handleImageDragStart(image.id, 'move', e)}
                        >
                          <div
                            className={styles.overlayHandleStart}
                            onMouseDown={(e) => handleImageDragStart(image.id, 'start', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div
                            className={styles.overlayHandleEnd}
                            onMouseDown={(e) => handleImageDragStart(image.id, 'end', e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {isSelected && (
                            <button
                              className={`${styles.replaceButton} ${isReplaceTarget ? styles.active : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isReplaceTarget) {
                                  setReplaceImageTargetId(null)
                                } else {
                                  setReplaceImageTargetId(image.id)
                                  replaceImageInputRef.current?.click()
                                }
                              }}
                              title={isReplaceTarget ? 'Cancel replace' : 'Replace image source'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                              </svg>
                            </button>
                          )}
                          <div className={styles.overlayBox}>
                            <img src={image.url} alt={image.name} className={styles.overlayThumbnail} />
                            <span className={styles.overlayName}>{image.name}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
