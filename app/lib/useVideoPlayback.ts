'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const getState = useManifestStore.getState
  const getSelectionState = useSelectionStore.getState

  useEffect(() => {
    const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp)
    const currentIds = new Set(sortedVideos.map((v) => v.id))

    videoElementsRef.current.forEach((el, id) => {
      if (!currentIds.has(id)) {
        el.pause()
        el.src = ''
        el.load()
        videoElementsRef.current.delete(id)
      }
    })

    sortedVideos.forEach((clip) => {
      if (!videoElementsRef.current.has(clip.id) && clip.url) {
        const video = document.createElement('video')
        video.preload = 'auto'
        video.playsInline = true
        video.muted = false
        video.src = clip.url

        video.onloadedmetadata = () => {
          const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
          if (!currentClip) return
          const hasTrim = currentClip.trimStart > 0 || currentClip.trimEnd > 0
          if (!hasTrim && video.duration && (!currentClip.duration || Math.abs(currentClip.duration - video.duration) > 0.1)) {
            useManifestStore.getState().updateVideo(clip.id, { duration: video.duration })
          }
        }

        videoElementsRef.current.set(clip.id, video)
      }
    })
  }, [videos])

  useEffect(() => {
    const currentIds = new Set(images.map((o) => o.id))

    imageElementsRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        imageElementsRef.current.delete(id)
      }
    })

    images.forEach((image) => {
      if (!imageElementsRef.current.has(image.id)) {
        const img = new Image()
        img.src = image.url
        imageElementsRef.current.set(image.id, img)
      }
    })
  }, [images])

  const drawVideoToCanvas = useCallback((video: HTMLVideoElement): boolean => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return false

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return false
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    const targetAspect = aspectRatio === '16:9' ? 16 / 9 : 9 / 16

    const rect = container.getBoundingClientRect()
    const containerAspect = rect.width / rect.height

    let canvasWidth: number
    let canvasHeight: number

    if (targetAspect > containerAspect) {
      canvasWidth = rect.width
      canvasHeight = rect.width / targetAspect
    } else {
      canvasHeight = rect.height
      canvasWidth = rect.height * targetAspect
    }

    canvasWidth = Math.round(canvasWidth)
    canvasHeight = Math.round(canvasHeight)

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      canvas.style.width = `${canvasWidth}px`
      canvas.style.height = `${canvasHeight}px`
      setCanvasDimensions({ width: canvasWidth, height: canvasHeight })
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return true
  }, [aspectRatio, canvasRef, containerRef])

  const drawImages = useCallback((ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, currentTime: number) => {
    const state = getState()
    const visibleImages = state.images.filter(
      (image) => currentTime >= image.startTime && currentTime < image.endTime
    )

    visibleImages.forEach((image) => {
      const img = imageElementsRef.current.get(image.id)
      if (!img || !img.complete || img.naturalWidth === 0) return

      ctx.save()
      ctx.globalAlpha = image.opacity

      const scaleX = canvasWidth / 1920
      const scaleY = canvasHeight / 1080
      const scale = Math.min(scaleX, scaleY)

      ctx.drawImage(img, image.x * scale, image.y * scale, image.width * scale, image.height * scale)
      ctx.restore()
    })
  }, [getState])

  useEffect(() => {
    let currentVideoId: string | null = null

    const loop = () => {
      const state = getState()
      const { playbackTime, isPlaying } = state
      const { selectedVideoId } = getSelectionState()
      const sorted = [...state.videos].sort((a, b) => a.timestamp - b.timestamp)

      const activeClip = sorted.find((v) => {
        if (!v.duration) return false
        return playbackTime >= v.timestamp && playbackTime < v.timestamp + v.duration
      }) || (selectedVideoId ? sorted.find((v) => v.id === selectedVideoId) : sorted[0])

      if (!activeClip) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const videoEl = videoElementsRef.current.get(activeClip.id)
      if (!videoEl) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const trimStart = activeClip.trimStart ?? 0
      const trimEnd = activeClip.trimEnd ?? 0
      const originalDuration = activeClip.originalDuration ?? activeClip.duration ?? 0
      const playbackEnd = originalDuration - trimEnd

      const localTimeInTrimmed = Math.max(0, playbackTime - activeClip.timestamp)
      const localTimeInOriginal = trimStart + localTimeInTrimmed

      if (currentVideoId !== activeClip.id) {
        if (currentVideoId) {
          const oldVideo = videoElementsRef.current.get(currentVideoId)
          if (oldVideo) oldVideo.pause()
        }

        currentVideoId = activeClip.id

        if (getSelectionState().selectedVideoId !== activeClip.id) {
          getSelectionState().setSelectedVideoId(activeClip.id)
        }

        videoEl.currentTime = localTimeInOriginal
      }

      if (isPlaying) {
        if (videoEl.paused && videoEl.readyState >= 3) {
          videoEl.play().catch(() => {})
        }

        if (!videoEl.paused) {
          const newGlobalTime = activeClip.timestamp + (videoEl.currentTime - trimStart)
          if (Math.abs(newGlobalTime - playbackTime) > 0.05) {
            state.setPlaybackTime(newGlobalTime)
          }
        }

        if (videoEl.ended || videoEl.currentTime >= playbackEnd - 0.05) {
          const currentIdx = sorted.findIndex((v) => v.id === activeClip.id)
          const nextClip = sorted[currentIdx + 1]

          if (nextClip) {
            getSelectionState().setSelectedVideoId(nextClip.id)
            state.setPlaybackTime(nextClip.timestamp)
          } else {
            state.setIsPlaying(false)
            state.setPlaybackTime(0)
          }
        }
      } else {
        if (!videoEl.paused) {
          videoEl.pause()
        }

        if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.05) {
          videoEl.currentTime = localTimeInOriginal
        }
      }

      const drawn = drawVideoToCanvas(videoEl)
      if (drawn) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (ctx && canvas) {
          drawImages(ctx, canvas.width, canvas.height, playbackTime)
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [getState, getSelectionState, drawVideoToCanvas, drawImages, canvasRef])

  useEffect(() => {
    return () => {
      videoElementsRef.current.forEach((video) => {
        video.pause()
        video.src = ''
        video.load()
      })
      videoElementsRef.current.clear()
    }
  }, [])

  return { canvasDimensions }
}
