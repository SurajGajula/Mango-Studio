'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { exportVideo, downloadBlob, ExportProgress, extractVideoClip } from '@/app/lib/videoExporter'
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import { resolveVideoMetadata, toMono, computeImageDimensions, computeMediaDimensions, computeMediaCropForAspect, generateVideoThumbnails, ASPECT_RATIOS } from '@/app/lib/mediaUtils'
import { drawAudioGraph } from '@/app/lib/drawAudioGraph'
import VideoReplaceModal from './VideoReplaceModal'
import PlaybackControls from './PlaybackControls'
import AudioTrack from './AudioTrack'
import MediaOverlayTrack from './MediaOverlayTrack'
import TextTrack from './TextTrack'
import MainTrack from './MainTrack'
import { useTimelineShortcuts } from '@/app/hooks/useTimelineShortcuts'
import styles from './Timeline.module.css'

type TrimHandle = 'start' | 'end' | null

interface TimelineProps {
  onOpenTransitions?: () => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
}

export default function Timeline({ onOpenTransitions, onOpenFont, onOpenEffects }: TimelineProps) {
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
  const duplicateItem = useManifestStore((state) => state.duplicateItem)
  const replaceImageSource = useManifestStore((state) => state.replaceImageSource)
  const replaceVideoSource = useManifestStore((state) => state.replaceVideoSource)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
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
  const trimAudio = useManifestStore((state) => state.trimAudio)
  const audios = useManifestStore((state) => state.audios)
  const effects = useManifestStore((state) => state.effects)
  const audioUrl = useAudioStore((state) => state.audioUrl)
  const userMarks = useAudioStore((state) => state.userMarks)
  const addUserMark = useAudioStore((state) => state.addUserMark)
  const clearUserMarks = useAudioStore((state) => state.clearUserMarks)
  const audioCanvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [replaceVideoData, setReplaceVideoData] = useState<{
    targetId: string
    targetType: 'image' | 'video'
    url: string
    title: string
    duration: number
    width: number
    height: number
    windowDuration: number
    initialTrimStart: number
  } | null>(null)
  const replaceImageWithVideo = useManifestStore((state) => state.replaceImageWithVideo)

  const [isExporting, setIsExporting] = useState(false)
  const [isReplacingClip, setIsReplacingClip] = useState(false)
  const exportAbortRef = useRef<AbortController | null>(null)
  const [isAudioSelected, setIsAudioSelected] = useState(false)
  const snapStateRef = useRef<{ dropTime: number } | null>(null)
  const prevRawTimeRef = useRef<number | null>(null)
  const lastReleasedDropRef = useRef<number | null>(null)
  const scrollGestureActiveRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [videoThumbnails, setVideoThumbnails] = useState<Map<string, Map<number, string>>>(new Map())
  const processingUrlsRef = useRef<Set<string>>(new Set())
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [audioTrimDragging, setAudioTrimDragging] = useState<{ audioId: string; handle: 'start' | 'end' } | null>(null)
  const audioTrimRef = useRef<{
    trimStart: number
    trimEnd: number
    originalDuration: number
    startTime: number
    fileOffset: number
    initialMouseX: number
    timelineWidth: number
    totalWithPadding: number
  } | null>(null)
  const [audioBodyDragging, setAudioBodyDragging] = useState<{ audioId: string } | null>(null)
  const audioBodyDragRef = useRef<{
    initialStartTime: number
    initialTrimStart: number
    initialOrigDuration: number
    initialEffectiveDuration: number
    initialMouseX: number
    timelineWidth: number
    totalWithPadding: number
    totalDuration: number
  } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const [overlayVideoDragging, setOverlayVideoDragging] = useState<{ videoId: string } | null>(null)
  const [textDragging, setTextDragging] = useState<{ textId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const trimStartRef = useRef<{
    trimStart: number
    trimEnd: number
    initialTimestamp: number
    originalDuration: number
    initialMouseX: number
    timelineWidth: number
    totalWithPadding: number
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
    totalWithPadding: number
  } | null>(null)
  const textDragRef = useRef<{
    initialMouseX: number
    initialStartTime: number
    initialEndTime: number
    timelineWidth: number
    totalWithPadding: number
  } | null>(null)
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [showCropMenu, setShowCropMenu] = useState(false)
  const cropMenuRef = useRef<HTMLDivElement>(null)
  const cropButtonRef = useRef<HTMLButtonElement>(null)

  const totalDuration = getTotalDuration()

  const MIN_VISIBLE = 0.5
  const MAX_VISIBLE = 120
  const [visibleDuration, setVisibleDuration] = useState(8)
  const effectivePadding = visibleDuration / 2
  const visibleDurationRef = useRef(8)
  const totalTimelineWidth = totalDuration > 0 ? ((totalDuration + effectivePadding * 2) / visibleDuration) * 100 : 100

  const formatTime = (seconds: number) => {
    const absSeconds = Math.abs(seconds)
    const mins = Math.floor(absSeconds / 60)
    const secs = Math.floor(absSeconds % 60)
    const ms = Math.floor((absSeconds % 1) * 100)
    const prefix = seconds < 0 ? '-' : ''
    return `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`
  }

  const getContentPosition = (time: number) => {
    const timeWithPadding = time + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    if (totalWithPadding === 0) return 0
    return (timeWithPadding / totalWithPadding) * 100
  }

  const handleTimelineDeselect = useCallback(() => {
    setSelectedVideoId(null)
    setSelectedImageId(null)
    setSelectedTextId(null)
    setIsAudioSelected(false)
  }, [setSelectedVideoId, setSelectedImageId, setSelectedTextId])

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
    const activeUrls = new Set(videos.map(v => v.url).filter(Boolean))
    setVideoThumbnails(prev => {
      let changed = false
      const next = new Map(prev)
      for (const url of Array.from(next.keys())) {
        if (!activeUrls.has(url)) {
          next.delete(url)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [videos])

  useEffect(() => {
    const neededByUrl = new Map<string, Set<number>>()
    videos.forEach((v) => {
      if (!v.url) return
      if (!neededByUrl.has(v.url)) neededByUrl.set(v.url, new Set())
      const set = neededByUrl.get(v.url)!
      const start = Math.floor(v.trimStart)
      const duration = v.duration ?? 0
      const end = Math.ceil(v.trimStart + duration)
      for (let s = start; s <= end; s++) {
        set.add(s)
      }
    })

    neededByUrl.forEach(async (neededSeconds, url) => {
      const existing = videoThumbnails.get(url)
      const missing = Array.from(neededSeconds).filter((s) => !existing || !existing.has(s))
      
      if (missing.length === 0) return
      if (processingUrlsRef.current.has(url)) return
      processingUrlsRef.current.add(url)

      try {
        await generateVideoThumbnails(url, missing, (time, data) => {
          setVideoThumbnails((prev) => {
            const next = new Map(prev)
            const urlMap = new Map(next.get(url) || [])
            urlMap.set(time, data)
            next.set(url, urlMap)
            return next
          })
        })
      } finally {
        processingUrlsRef.current.delete(url)
      }
    })
  }, [videos, videoThumbnails])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = URL.createObjectURL(file)
        const { duration, width: videoWidth, height: videoHeight } = await resolveVideoMetadata(blobUrl)
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        const start = playbackTime
        const end = start + duration
        const mediaItems = [
          ...images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
          ...videos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
        ]
        const row = findFreeRow(mediaItems, start, end)
        const isMainTrack = row === 0
        let x, y, width, height, cropAspect, cropSx, cropSy, cropSw, cropSh
        if (isMainTrack) {
          const [rw, rh] = ASPECT_RATIOS[aspectRatio]
          const crop = await computeMediaCropForAspect(blobUrl, 'video', aspectRatio, rw, rh, aspectRatio)
          x = crop.x; y = crop.y; width = crop.width; height = crop.height
          cropAspect = crop.cropAspect; cropSx = crop.cropSx; cropSy = crop.cropSy; cropSw = crop.cropSw; cropSh = crop.cropSh
        } else {
          const dims = computeMediaDimensions(videoWidth, videoHeight, aspectRatio, isMainTrack)
          x = dims.x; y = dims.y; width = dims.width; height = dims.height
        }
        addVideo(new VideoClass(id, title, blobUrl, duration, start, undefined, undefined, undefined, 0, 0, undefined, !isMainTrack, x, y, width, height, undefined, undefined, undefined, row, false, cropAspect, cropSx, cropSy, cropSw, cropSh))
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const start = playbackTime
        const end = start + 5
        const mediaItems = [
          ...images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
          ...videos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
        ]
        const row = findFreeRow(mediaItems, start, end)
        const isMainTrack = row === 0
        const { x, y, width, height } = await computeImageDimensions(url, aspectRatio, isMainTrack)
        addImage(new ImageClass(
          `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file.name,
          url,
          start,
          end,
          x, y, width, height, 1,
          undefined,
          isMainTrack,
          undefined, undefined, undefined, undefined, undefined, undefined, undefined,
          row,
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
          const audioDuration = audioBuffer.duration
          const defaultTrimEnd = Math.max(0, audioDuration - totalDuration)
          const audioInstance = new AudioClass(audioId, file.name, blobUrl, 0, audioDuration, [], undefined, 0, defaultTrimEnd, audioDuration)
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


  const findFreeRow = useCallback((
    items: Array<{ startTime: number; endTime: number; row: number }>,
    start: number,
    end: number
  ): number => {
    let row = 0
    while (true) {
      const rowItems = items.filter((i) => i.row === row)
      const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
      if (!hasOverlap) return row
      row++
    }
  }, [])

  const handleReplaceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !replaceTargetId) return

    const image = images.find((img) => img.id === replaceTargetId)
    const video = videos.find((v) => v.id === replaceTargetId)
    
    if (image) {
      if (file.type.startsWith('image/')) {
        const newUrl = URL.createObjectURL(file)
        const newName = file.name
        replaceImageSource(replaceTargetId, newUrl, newName)
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const windowDuration = image.duration

        if (duration < windowDuration) {
          alert(`Video is too short. Selected image is ${windowDuration.toFixed(1)}s, but video is only ${duration.toFixed(1)}s.`)
          URL.revokeObjectURL(url)
          return
        }

        if (duration === windowDuration) {
          const videoInstance = new VideoClass(
            `video-${Date.now()}`,
            file.name,
            url,
            windowDuration,
            image.startTime,
            undefined, undefined,
            duration,
            0, 0,
            undefined,
            !image.isMainTrack,
            image.x, image.y, image.width, image.height,
            image.opacity,
            image.zoom,
            image.zoomIntensity,
            image.row,
            false
          )
          replaceImageWithVideo(replaceTargetId, videoInstance)
          setReplaceTargetId(null)
        } else {
          setReplaceVideoData({
            targetId: replaceTargetId,
            targetType: 'image',
            url,
            title: file.name,
            duration,
            width,
            height,
            windowDuration,
            initialTrimStart: 0,
          })
        }
      }
    } else if (video) {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const imageInstance = new ImageClass(
          `image-${Date.now()}`,
          file.name,
          url,
          video.timestamp,
          video.timestamp + (video.duration ?? 5),
          video.x, video.y, video.width, video.height,
          video.opacity,
          undefined,
          !video.isOverlay,
          video.zoom,
          undefined, undefined, undefined, undefined, undefined,
          video.zoomIntensity,
          video.row
        )
        replaceVideoWithImage(replaceTargetId, imageInstance)
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const windowDuration = video.duration ?? 5

        if (duration < windowDuration) {
          alert(`Video is too short. Current video clip is ${windowDuration.toFixed(1)}s, but new video is only ${duration.toFixed(1)}s.`)
          URL.revokeObjectURL(url)
          return
        }

        if (duration === windowDuration) {
          replaceVideoSource(replaceTargetId, url, file.name)
          setReplaceTargetId(null)
        } else {
          setReplaceVideoData({
            targetId: replaceTargetId,
            targetType: 'video',
            url,
            title: file.name,
            duration,
            width,
            height,
            windowDuration,
            initialTrimStart: 0,
          })
        }
      }
    }

    e.target.value = ''
  }

  const handleCancelReplaceVideo = () => {
    if (replaceVideoData) {
      URL.revokeObjectURL(replaceVideoData.url)
    }
    setReplaceVideoData(null)
    setReplaceTargetId(null)
  }

  const handleConfirmReplaceVideo = async (trimStart: number) => {
    if (!replaceVideoData) return
    setIsReplacingClip(true)

    try {
      let finalUrl = replaceVideoData.url
      let finalTrimStart = trimStart
      let finalTrimEnd = replaceVideoData.duration - (trimStart + replaceVideoData.windowDuration)
      let finalOriginalDuration = replaceVideoData.duration

      // Optimization: If the source video is > 60s, extract just the clip to a new blob
      const originalSourceUrl = replaceVideoData.url
      if (replaceVideoData.duration > 60) {
        setExportProgress({ phase: 'rendering', progress: 0, message: 'Extracting clip...' })
        try {
          const clipBlob = await extractVideoClip(
            replaceVideoData.url,
            trimStart,
            replaceVideoData.windowDuration,
            (msg) => setExportProgress({ phase: 'rendering', progress: 50, message: msg })
          )
          finalUrl = URL.createObjectURL(clipBlob)
          finalTrimStart = 0
          finalTrimEnd = 0
          finalOriginalDuration = replaceVideoData.windowDuration
        } catch (err) {
          console.error('Failed to extract clip:', err)
          alert('Failed to process video clip. Using original source instead.')
        } finally {
          setExportProgress(null)
        }
      }

      if (replaceVideoData.targetType === 'image') {
        const image = images.find((img) => img.id === replaceVideoData.targetId)
        if (!image) return
        
        const oldUrl = image.url

        const videoInstance = new VideoClass(
          `video-${Date.now()}`,
          replaceVideoData.title,
          finalUrl,
          replaceVideoData.windowDuration,
          image.startTime,
          undefined, undefined,
          finalOriginalDuration,
          finalTrimStart,
          finalTrimEnd,
          undefined,
          !image.isMainTrack,
          image.x, image.y, image.width, image.height,
          image.opacity,
          image.zoom,
          image.zoomIntensity,
          image.row,
          false
        )

        replaceImageWithVideo(replaceVideoData.targetId, videoInstance)
        
        if (oldUrl.startsWith('blob:')) {
          const stillUsed = useManifestStore.getState().images.some(img => img.url === oldUrl)
          if (!stillUsed) URL.revokeObjectURL(oldUrl)
        }
      } else {
        const video = videos.find((v) => v.id === replaceVideoData.targetId)
        if (!video) return
        
        const oldUrl = video.url

        updateVideo(video.id, {
          url: finalUrl,
          title: replaceVideoData.title,
          duration: replaceVideoData.windowDuration,
          originalDuration: finalOriginalDuration,
          trimStart: finalTrimStart,
          trimEnd: finalTrimEnd
        })

        if (oldUrl && oldUrl !== finalUrl && oldUrl.startsWith('blob:')) {
          const stillUsed = useManifestStore.getState().videos.some(v => v.url === oldUrl)
          if (!stillUsed) {
            URL.revokeObjectURL(oldUrl)
            setVideoThumbnails(prev => {
              const next = new Map(prev)
              next.delete(oldUrl)
              return next
            })
          }
        }
      }

      if (originalSourceUrl !== finalUrl && originalSourceUrl.startsWith('blob:')) {
        const stillUsed = useManifestStore.getState().videos.some(v => v.url === originalSourceUrl) ||
                          useManifestStore.getState().images.some(img => img.url === originalSourceUrl)
        if (!stillUsed) URL.revokeObjectURL(originalSourceUrl)
      }

      setReplaceVideoData(null)
      setReplaceTargetId(null)
    } finally {
      setIsReplacingClip(false)
    }
  }

  const handleVideoDoubleClick = (videoId: string) => {
    const video = videos.find((v) => v.id === videoId)
    if (!video || !video.url) return

    const originalDuration = video.originalDuration ?? video.duration ?? 0
    if (originalDuration <= video.duration!) return

    setReplaceVideoData({
      targetId: videoId,
      targetType: 'video',
      url: video.url,
      title: video.title,
      duration: originalDuration,
      width: video.width,
      height: video.height,
      windowDuration: video.duration!,
      initialTrimStart: video.trimStart,
    })
  }

  const handleExport = async () => {
    const hasMainContent = videos.filter((v) => !v.isOverlay).length > 0 || images.filter((img) => img.isMainTrack).length > 0
    if (isExporting || !hasMainContent) return

    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    const controller = new AbortController()
    exportAbortRef.current = controller

    try {
      const audioTrimStart = audios[0]?.trimStart ?? 0
      const audioStartTime = audios[0]?.startTime ?? 0
      const blob = await exportVideo(videos, aspectRatio, setExportProgress, images, audioUrl, texts, audioTrimStart, audioStartTime, effects, controller.signal)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadBlob(blob, `mango-export-${timestamp}.mp4`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportProgress({ phase: 'error', progress: 0, message: 'Export cancelled' })
      } else {
        setExportProgress({
          phase: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Export failed',
        })
      }
    } finally {
      exportAbortRef.current = null
      setIsExporting(false)
      setTimeout(() => setExportProgress(null), 3000)
    }
  }

  const handleCancelExport = () => {
    exportAbortRef.current?.abort()
  }

  const handleTrimStart = useCallback((videoId: string, handle: TrimHandle, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return

    const rect = timelineRowRef.current.getBoundingClientRect()
    const totalWithPadding = totalDuration + effectivePadding * 2
    
    setTrimDragging({ videoId, handle })
    trimStartRef.current = {
      trimStart: video.trimStart,
      trimEnd: video.trimEnd,
      initialTimestamp: video.timestamp,
      originalDuration: video.originalDuration ?? video.duration ?? 0,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding,
    }
    setIsPlaying(false)
  }, [videos, setIsPlaying])

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimDragging || !timelineRowRef.current || !trimStartRef.current) return

    const video = videos.find((v) => v.id === trimDragging.videoId)
    if (!video) return

    const { originalDuration, trimStart: initialTrimStart, trimEnd: initialTrimEnd, initialTimestamp, initialMouseX, timelineWidth, totalWithPadding: initialTotalWithPadding } = trimStartRef.current
    
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * initialTotalWithPadding
    
    const minDuration = 0.5
    const snapThreshold = 0.15

    const currentPlaybackTime = useManifestStore.getState().playbackTime
    const localPlaybackInVideo = currentPlaybackTime - initialTimestamp + initialTrimStart

    if (trimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime
      
      if (Math.abs(newTrimStart - localPlaybackInVideo) < snapThreshold) {
        newTrimStart = localPlaybackInVideo
      } else {
        const globalLeftEdge = initialTimestamp + (newTrimStart - initialTrimStart)
        const snapped = snapToMarkers(globalLeftEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalLeftEdge) {
          newTrimStart = initialTrimStart + (snapped - initialTimestamp)
        }
      }

      const maxTrimStart = originalDuration - initialTrimEnd - minDuration
      newTrimStart = Math.max(0, Math.min(newTrimStart, maxTrimStart))
      
      const actualDelta = newTrimStart - initialTrimStart
      const newTimestamp = initialTimestamp + actualDelta
      
      const frameTimeInOriginal = localPlaybackInVideo
      
      trimVideo(trimDragging.videoId, newTrimStart, initialTrimEnd, newTimestamp)
      
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
        const globalRightEdge = initialTimestamp + originalDuration - initialTrimStart - newTrimEnd
        const snapped = snapToMarkers(globalRightEdge, useAudioStore.getState().userMarks, snapThreshold)
        if (snapped !== globalRightEdge) {
          newTrimEnd = originalDuration - initialTrimStart - (snapped - initialTimestamp)
        }
      }
      
      const maxTrimEnd = originalDuration - initialTrimStart - minDuration
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, maxTrimEnd))
      
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
    }
  }, [trimDragging, videos, trimVideo, setPlaybackTime])

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
    audioTrimRef.current = {
      trimStart: audioItem.trimStart,
      trimEnd: audioItem.trimEnd,
      originalDuration: audioItem.originalDuration,
      startTime: audioItem.startTime,
      fileOffset: audioItem.startTime - audioItem.trimStart,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
    setIsPlaying(false)
  }, [audios, totalDuration, effectivePadding, setIsPlaying])

  const handleAudioTrimMove = useCallback((e: MouseEvent) => {
    if (!audioTrimDragging || !audioTrimRef.current) return
    const { trimStart: initialTrimStart, trimEnd: initialTrimEnd, originalDuration, fileOffset, initialMouseX, timelineWidth, totalWithPadding } = audioTrimRef.current
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalWithPadding
    const minDuration = 0.5

    if (audioTrimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime
      newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - minDuration))
      const newStartTime = Math.max(0, fileOffset + newTrimStart)
      trimAudio(audioTrimDragging.audioId, newTrimStart, initialTrimEnd, newStartTime)
    } else {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - minDuration))
      trimAudio(audioTrimDragging.audioId, initialTrimStart, newTrimEnd)
    }
  }, [audioTrimDragging, trimAudio])

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
  }, [audios, totalDuration, effectivePadding, setIsPlaying])

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
        if (isMainTrack && initialStartTime === 0) {
          const trimDelta = newStartTime - initialStartTime
          updateImage(imageId, { startTime: 0, endTime: Math.max(0.5, initialEndTime - trimDelta) })
        } else {
          updateImage(imageId, { startTime: newStartTime })
        }
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
    const rect = timelineRowRef.current.getBoundingClientRect()
    const totalWithPadding = totalDuration + effectivePadding * 2
    
    setOverlayVideoDragging({ videoId })
    overlayVideoDragRef.current = {
      initialMouseX: e.clientX,
      initialTimestamp: video.timestamp,
      timelineWidth: rect.width,
      totalWithPadding,
    }
  }

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
    const start = playbackTime
    const end = start + 5
    const row = findFreeRow(
      texts.map((t) => ({ startTime: t.startTime, endTime: t.endTime, row: t.row })),
      start,
      end
    )
    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const baseFontSize = 96
    const textWidth = Math.round(logicalW * 0.4)
    const fontSize = baseFontSize
    const textLogicalHeight = fontSize * 1.2
    const defaultX = Math.round((logicalW - textWidth) / 2)
    const defaultY = Math.round((logicalH - textLogicalHeight) / 2)
    addText(new TextClass(id, 'Text', start, end, defaultX, defaultY, textWidth, undefined, undefined, fontSize, undefined, undefined, undefined, undefined, undefined, undefined, row))
  }

  const handleTextDragStart = (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const text = texts.find((t) => t.id === textId)
    if (!text || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    const totalWithPadding = totalDuration + effectivePadding * 2
    
    setTextDragging({ textId, handle })
    textDragRef.current = {
      initialMouseX: e.clientX,
      initialStartTime: text.startTime,
      initialEndTime: text.endTime,
      timelineWidth: rect.width,
      totalWithPadding,
    }
  }

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
    if (!audioTrimDragging) return
    document.addEventListener('mousemove', handleAudioTrimMove)
    document.addEventListener('mouseup', handleAudioTrimEnd)
    return () => {
      document.removeEventListener('mousemove', handleAudioTrimMove)
      document.removeEventListener('mouseup', handleAudioTrimEnd)
    }
  }, [audioTrimDragging, handleAudioTrimMove, handleAudioTrimEnd])

  useEffect(() => {
    if (!audioBodyDragging) return
    document.addEventListener('mousemove', handleAudioBodyDragMove)
    document.addEventListener('mouseup', handleAudioBodyDragEnd)
    return () => {
      document.removeEventListener('mousemove', handleAudioBodyDragMove)
      document.removeEventListener('mouseup', handleAudioBodyDragEnd)
    }
  }, [audioBodyDragging, handleAudioBodyDragMove, handleAudioBodyDragEnd])

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

  useTimelineShortcuts({
    replaceVideoData,
    applyZoom,
    visibleDurationRef,
    MIN_VISIBLE,
    MAX_VISIBLE,
    isAudioSelected,
    setIsAudioSelected,
    uploadInputRef,
  })

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (replaceVideoData) return
      const container = scrollContainerRef.current
      if (!container || !container.contains(e.target as Node)) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = Math.exp(e.deltaY * 0.005)
        const next = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, visibleDurationRef.current * factor))
        applyZoom(next)
      } else {
        e.preventDefault()
        if (!useManifestStore.getState().isPlaying) {
          const delta = e.deltaX + e.deltaY
          const atLeftEdge = container.scrollLeft === 0
          container.scrollLeft += delta
          if (atLeftEdge && delta < 0) {
            useManifestStore.getState().setPlaybackTime(0)
          }
        }
      }
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [applyZoom])

  useEffect(() => {
    const canvas = audioCanvasRef.current
    if (!canvas || !audioAnalysis) return
    const audioItem = useManifestStore.getState().audios[0]
    const draw = () => drawAudioGraph(canvas, audioAnalysis, totalDuration, effectivePadding, audioItem?.trimStart ?? 0, audioItem?.trimEnd ?? 0, audioItem?.startTime ?? 0)
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [audioAnalysis, totalDuration, effectivePadding, audios])

  useEffect(() => {
    if (!showCropMenu) return
    const handler = (e: MouseEvent) => {
      if (
        cropMenuRef.current && !cropMenuRef.current.contains(e.target as Node) &&
        cropButtonRef.current && !cropButtonRef.current.contains(e.target as Node)
      ) {
        setShowCropMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCropMenu])

  return (
    <div className={styles.container}>
      {replaceVideoData && (
        <VideoReplaceModal
          videoUrl={replaceVideoData.url}
          windowDuration={replaceVideoData.windowDuration}
          videoDuration={replaceVideoData.duration}
          initialTrimStart={replaceVideoData.initialTrimStart}
          confirmLabel={replaceVideoData.targetType === 'image' ? 'Replace' : 'Update'}
          isProcessing={isReplacingClip}
          onConfirm={handleConfirmReplaceVideo}
          onCancel={handleCancelReplaceVideo}
        />
      )}
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
          ref={replaceInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleReplaceSelect}
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
            <PlaybackControls
              playbackTime={playbackTime}
              totalDuration={totalDuration}
              formatTime={formatTime}
              uploadInputRef={uploadInputRef}
              onOpenTransitions={onOpenTransitions}
              onOpenFont={onOpenFont}
              onOpenEffects={onOpenEffects}
              isExporting={isExporting}
              handleExport={handleExport}
              handleCancelExport={handleCancelExport}
              exportProgress={exportProgress}
              setIsAudioSelected={setIsAudioSelected}
              isAudioSelected={isAudioSelected}
              handleAddText={handleAddText}
              showCropMenu={showCropMenu}
              setShowCropMenu={setShowCropMenu}
              cropButtonRef={cropButtonRef}
              cropMenuRef={cropMenuRef}
            />
            <div className={styles.timelineRowContainer}>
              <div className={styles.playheadLine} />
              <div ref={scrollContainerRef} className={styles.scrollContainer} onScroll={handleScroll}>
                <div
                  className={styles.timelineContent}
                  style={{ width: `${totalTimelineWidth}%` }}
                  onClick={handleTimelineDeselect}
                >
                  <AudioTrack
                    totalDuration={totalDuration}
                    effectivePadding={effectivePadding}
                    getContentPosition={getContentPosition}
                    setIsAudioSelected={setIsAudioSelected}
                    isAudioSelected={isAudioSelected}
                    handleAudioBodyDragStart={handleAudioBodyDragStart}
                    handleAudioTrimStart={handleAudioTrimStart}
                    audioCanvasRef={audioCanvasRef}
                  />
                  {(() => {
                    const mediaOverlayRows = [...new Set([
                      ...images.filter((img) => !img.isMainTrack).map((img) => img.row),
                      ...videos.filter((v) => v.isOverlay).map((v) => v.row),
                    ])].sort((a, b) => b - a)
                    return mediaOverlayRows.map((rowIndex) => (
                      <MediaOverlayTrack
                        key={`overlay-row-${rowIndex}`}
                        rowIndex={rowIndex}
                        getContentPosition={getContentPosition}
                        totalDuration={totalDuration}
                        effectivePadding={effectivePadding}
                        setSelectedImageId={setSelectedImageId}
                        setSelectedVideoId={setSelectedVideoId}
                        handleImageDragStart={handleImageDragStart}
                        handleOverlayVideoDragStart={handleOverlayVideoDragStart}
                        handleTrimStart={handleTrimStart}
                        handleVideoDoubleClick={handleVideoDoubleClick}
                        replaceTargetId={replaceTargetId}
                        setReplaceTargetId={setReplaceTargetId}
                        replaceInputRef={replaceInputRef}
                      />
                    ))
                  })()}
                  {(() => {
                    const textRows = [...new Set(texts.map((t) => t.row))].sort((a, b) => a - b)
                    return textRows.map((rowIndex) => (
                      <TextTrack
                        key={`text-row-${rowIndex}`}
                        rowIndex={rowIndex}
                        getContentPosition={getContentPosition}
                        totalDuration={totalDuration}
                        effectivePadding={effectivePadding}
                        setSelectedTextId={setSelectedTextId}
                        setSelectedVideoId={setSelectedVideoId}
                        setSelectedImageId={setSelectedImageId}
                        handleTextDragStart={handleTextDragStart}
                      />
                    ))
                  })()}
                  <MainTrack
                    getContentPosition={getContentPosition}
                    totalDuration={totalDuration}
                    effectivePadding={effectivePadding}
                    setSelectedVideoId={setSelectedVideoId}
                    setSelectedImageId={setSelectedImageId}
                    handleTrimStart={handleTrimStart}
                    handleVideoDoubleClick={handleVideoDoubleClick}
                    replaceTargetId={replaceTargetId}
                    setReplaceTargetId={setReplaceTargetId}
                    replaceInputRef={replaceInputRef}
                    videoThumbnails={videoThumbnails}
                    scrollContainerRef={scrollContainerRef}
                    handleImageDragStart={handleImageDragStart}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
