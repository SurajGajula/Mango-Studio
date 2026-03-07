'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const audioUrl = useAudioStore((state) => state.audioUrl)
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
      const existing = imageElementsRef.current.get(image.id)
      if (existing) {
        if (existing.src !== image.url) existing.src = image.url
      } else {
        const img = new Image()
        img.src = image.url
        imageElementsRef.current.set(image.id, img)
      }
    })
  }, [images])

  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
      audioElementRef.current = null
    }
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audio.preload = 'auto'
    audioElementRef.current = audio
  }, [audioUrl])

  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
        audioElementRef.current = null
      }
    }
  }, [])

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

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const videoAspect = video.videoWidth / video.videoHeight
    const canvasAspect = canvas.width / canvas.height
    let drawWidth = canvas.width
    let drawHeight = canvas.height
    let drawX = 0
    let drawY = 0

    if (videoAspect > canvasAspect) {
      drawHeight = canvas.width / videoAspect
      drawY = (canvas.height - drawHeight) / 2
    } else {
      drawWidth = canvas.height * videoAspect
      drawX = (canvas.width - drawWidth) / 2
    }

    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight)

    return true
  }, [aspectRatio, canvasRef, containerRef])

  const drawImages = useCallback((ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, currentTime: number, mainTrackOnly: boolean) => {
    const state = getState()
    let visibleImages = state.images.filter(
      (image) =>
        currentTime >= image.startTime &&
        currentTime < image.endTime &&
        image.isMainTrack === mainTrackOnly
    )

    if (mainTrackOnly && visibleImages.length === 0) {
      const mainImages = state.images.filter((img) => img.isMainTrack)
      const lastEnded = mainImages
        .filter((img) => img.endTime <= currentTime)
        .sort((a, b) => b.endTime - a.endTime)[0]
      if (lastEnded) visibleImages = [lastEnded]
    }

    const xScale = canvasWidth / 1920
    const yScale = canvasHeight / 1080

    visibleImages.forEach((image) => {
      const img = imageElementsRef.current.get(image.id)
      if (!img || !img.complete || img.naturalWidth === 0) return
      ctx.save()
      ctx.globalAlpha = image.opacity
      ctx.drawImage(img, image.x * xScale, image.y * yScale, image.width * xScale, image.height * yScale)
      ctx.restore()
    })
  }, [getState])

  const drawOverlayVideos = useCallback((ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, currentTime: number) => {
    const state = getState()
    const overlayVideos = state.videos.filter((v) => v.isOverlay)

    const xScale = canvasWidth / 1920
    const yScale = canvasHeight / 1080

    overlayVideos.forEach((video) => {
      const localTime = currentTime - video.timestamp
      if (localTime < 0 || localTime >= (video.duration ?? 0)) return

      const videoEl = videoElementsRef.current.get(video.id)
      if (!videoEl || videoEl.readyState < 2) return

      const targetTime = (video.trimStart ?? 0) + localTime
      if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
        videoEl.currentTime = targetTime
      }

      ctx.save()
      ctx.globalAlpha = video.opacity
      ctx.drawImage(videoEl, video.x * xScale, video.y * yScale, video.width * xScale, video.height * yScale)
      ctx.restore()
    })
  }, [getState])

  useEffect(() => {
    let currentVideoId: string | null = null

    const drawOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      drawImages(ctx, w, h, t, false)
      drawOverlayVideos(ctx, w, h, t)
    }

    const setupCanvas = (canvas: HTMLCanvasElement, container: HTMLDivElement): CanvasRenderingContext2D | null => {
      const targetAspect = aspectRatio === '16:9' ? 16 / 9 : 9 / 16
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const containerAspect = rect.width / rect.height
      let cw: number, ch: number
      if (targetAspect > containerAspect) { cw = rect.width; ch = rect.width / targetAspect }
      else { ch = rect.height; cw = rect.height * targetAspect }
      cw = Math.round(cw); ch = Math.round(ch)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch
        canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`
        setCanvasDimensions({ width: cw, height: ch })
      }
      return canvas.getContext('2d')
    }

    let lastTimestamp: number | null = null

    const loop = (timestamp: number) => {
      const state = getState()
      const { playbackTime, isPlaying } = state
      const { selectedVideoId } = getSelectionState()
      const sorted = [...state.videos].filter((v) => !v.isOverlay).sort((a, b) => a.timestamp - b.timestamp)

      const timeRangeClip = sorted.find((v) => {
        if (!v.duration) return false
        return playbackTime >= v.timestamp && playbackTime < v.timestamp + v.duration
      })

      const activeClip = timeRangeClip || (selectedVideoId ? sorted.find((v) => v.id === selectedVideoId) : sorted[0])

      const canvas = canvasRef.current
      const container = containerRef.current

      if (!timeRangeClip) {
        if (canvas && container) {
          const ctx = setupCanvas(canvas, container)
          if (ctx) {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            drawImages(ctx, canvas.width, canvas.height, playbackTime, true)
            drawOverlays(ctx, canvas.width, canvas.height, playbackTime)
          }
        }

        const audioEl = audioElementRef.current

        if (isPlaying) {
          const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0
          lastTimestamp = timestamp
          const totalDur = state.getTotalDuration()
          const newTime = playbackTime + delta
          if (newTime >= totalDur) {
            state.setIsPlaying(false)
            state.setPlaybackTime(0)
            if (audioEl && !audioEl.paused) audioEl.pause()
          } else {
            state.setPlaybackTime(newTime)
            if (audioEl) {
              if (Math.abs(audioEl.currentTime - newTime) > 0.3) audioEl.currentTime = newTime
              if (audioEl.paused && audioEl.readyState >= 2) audioEl.play().catch(() => {})
            }
          }
        } else {
          lastTimestamp = null
          if (audioEl && !audioEl.paused) audioEl.pause()
          if (audioEl && Math.abs(audioEl.currentTime - playbackTime) > 0.3) {
            audioEl.currentTime = playbackTime
          }
          if (activeClip) {
            const videoEl = videoElementsRef.current.get(activeClip.id)
            if (videoEl) {
              const localTimeInOriginal = (activeClip.trimStart ?? 0) + Math.max(0, playbackTime - activeClip.timestamp)
              if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.05) videoEl.currentTime = localTimeInOriginal
              if (!videoEl.paused) videoEl.pause()
            }
          }
        }

      rafRef.current = requestAnimationFrame(loop)
      return
    }

    lastTimestamp = null

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

      const audioEl = audioElementRef.current

      if (isPlaying) {
        if (videoEl.paused && videoEl.readyState >= 3) {
          videoEl.play().catch(() => {})
        }

        if (audioEl && audioEl.paused && audioEl.readyState >= 2) {
          if (Math.abs(audioEl.currentTime - playbackTime) > 0.2) {
            audioEl.currentTime = playbackTime
          }
          audioEl.play().catch(() => {})
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
            if (audioEl && !audioEl.paused) audioEl.pause()
          }
        }
      } else {
        if (!videoEl.paused) videoEl.pause()
        if (audioEl && !audioEl.paused) audioEl.pause()

        if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.05) {
          videoEl.currentTime = localTimeInOriginal
        }

        if (audioEl && Math.abs(audioEl.currentTime - playbackTime) > 0.3) {
          audioEl.currentTime = playbackTime
        }
      }

      const drawn = drawVideoToCanvas(videoEl)
      if (drawn && canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawOverlays(ctx, canvas.width, canvas.height, playbackTime)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [getState, getSelectionState, drawVideoToCanvas, drawImages, drawOverlayVideos, canvasRef])

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
