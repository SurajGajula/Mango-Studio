'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [contentRect, setContentRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const contentRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const playbackTime = useManifestStore((state) => state.playbackTime)
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
      let video = videoElementsRef.current.get(clip.id)
      const isNearPlayhead = Math.abs(clip.timestamp - playbackTime) < 10 || 
                             (playbackTime >= clip.timestamp && playbackTime < clip.timestamp + (clip.duration ?? 0))

      if (!video && clip.url && isNearPlayhead) {
        video = document.createElement('video')
        video.preload = 'auto'
        video.playsInline = true
        video.src = clip.url

        video.onloadedmetadata = () => {
          const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
          if (!currentClip) return
          const hasTrim = currentClip.trimStart > 0 || currentClip.trimEnd > 0
          if (!hasTrim && video!.duration && (!currentClip.duration || Math.abs(currentClip.duration - video!.duration) > 0.1)) {
            useManifestStore.getState().updateVideo(clip.id, { duration: video!.duration })
          }
        }

        videoElementsRef.current.set(clip.id, video)
      } else if (video && clip.url && video.src !== clip.url && isNearPlayhead) {
        // Update URL if it changed but ID is same (e.g. after replacement)
        video.pause()
        video.src = clip.url
        video.load()
      } else if (video && !isNearPlayhead) {
        // Unload videos that are far from playhead to save memory
        video.pause()
        video.src = ''
        video.load()
        videoElementsRef.current.delete(clip.id)
        video = undefined
      }

      if (video && video.muted !== clip.muted) {
        video.muted = clip.muted
      }
    })
  }, [videos, Math.floor(playbackTime / 2)]) // Only run preloading check every 2 seconds or when videos change

  useEffect(() => {
    const currentIds = new Set(images.map((o) => o.id))

    imageElementsRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        imageElementsRef.current.delete(id)
      }
    })

    images.forEach((image) => {
      const isNearPlayhead = Math.abs(image.startTime - playbackTime) < 30 || 
                             (playbackTime >= image.startTime && playbackTime < image.endTime)

      const existing = imageElementsRef.current.get(image.id)
      
      if (!isNearPlayhead) {
        if (existing) {
          existing.src = ''
          imageElementsRef.current.delete(image.id)
        }
        return
      }

      if (existing) {
        if (existing.src !== image.url) existing.src = image.url
      } else {
        const img = new Image()
        img.src = image.url
        imageElementsRef.current.set(image.id, img)
      }
    })
  }, [images, playbackTime])

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

  const computeContentRect = useCallback((cw: number, ch: number) => {
    const targetAspect = aspectRatio === '16:9' ? 16 / 9 : 9 / 16
    const canvasAspect = cw / ch
    let x: number, y: number, width: number, height: number
    if (Math.abs(canvasAspect - targetAspect) < 0.001) {
      x = 0; y = 0; width = cw; height = ch
    } else if (canvasAspect > targetAspect) {
      height = ch
      width = Math.round(ch * targetAspect)
      x = Math.round((cw - width) / 2)
      y = 0
    } else {
      width = cw
      height = Math.round(cw / targetAspect)
      x = 0
      y = Math.round((ch - height) / 2)
    }
    return { x, y, width, height }
  }, [aspectRatio])

  const applyCanvasSize = useCallback((canvas: HTMLCanvasElement, cw: number, ch: number) => {
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`
    }
    const cr = computeContentRect(cw, ch)
    const prev = contentRectRef.current
    if (cr.x !== prev.x || cr.y !== prev.y || cr.width !== prev.width || cr.height !== prev.height) {
      contentRectRef.current = cr
      setContentRect(cr)
    }
    return cr
  }, [computeContentRect])

  const drawVideoToCanvas = useCallback((videoEl: HTMLVideoElement, videoClip: VideoClass, currentTime: number): { x: number; y: number; width: number; height: number } | null => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return null

    if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      return null
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const rect = container.getBoundingClientRect()
    const cw = Math.round(rect.width)
    const ch = Math.round(rect.height)
    const cr = applyCanvasSize(canvas, cw, ch)

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW
    const yScale = cr.height / logicalH

    const drawX = cr.x + (videoClip.x ?? 0) * xScale
    const drawY = cr.y + (videoClip.y ?? 0) * yScale
    const drawWidth = (videoClip.width ?? logicalW) * xScale
    const drawHeight = (videoClip.height ?? logicalH) * yScale

    const cropSx = videoClip.cropSx ?? 0
    const cropSy = videoClip.cropSy ?? 0
    const cropSw = videoClip.cropSw ?? 1
    const cropSh = videoClip.cropSh ?? 1

    const duration = videoClip.duration ?? 0
    const elapsedTime = currentTime - videoClip.timestamp
    const progress = duration > 0 ? elapsedTime / duration : 0

    applyZoomTransform(ctx, videoClip.zoom, progress, videoEl, drawX, drawY, drawWidth, drawHeight, cropSx, cropSy, cropSw, cropSh, videoClip.zoomIntensity, elapsedTime)

    return { x: Math.round(drawX), y: Math.round(drawY), width: Math.round(drawWidth), height: Math.round(drawHeight) }
  }, [canvasRef, containerRef, applyCanvasSize, aspectRatio])

  const drawImages = useCallback((ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, currentTime: number, mainTrackOnly: boolean) => {
    const { x: cx, y: cy, width: canvasWidth, height: canvasHeight } = cr
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

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = canvasWidth / logicalW
    const yScale = canvasHeight / logicalH

    visibleImages.forEach((image) => {
      const img = imageElementsRef.current.get(image.id)
      if (!img || !img.complete || img.naturalWidth === 0) return
      const elapsedTime = currentTime - image.startTime
      const progress = image.duration > 0 ? elapsedTime / image.duration : 0
      ctx.save()
      ctx.globalAlpha = image.opacity
      applyZoomTransform(ctx, image.zoom, progress, img, cx + image.x * xScale, cy + image.y * yScale, image.width * xScale, image.height * yScale, image.cropSx, image.cropSy, image.cropSw, image.cropSh, image.zoomIntensity, elapsedTime)
      ctx.restore()
    })
  }, [getState])

  const drawOverlayVideos = useCallback((ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, currentTime: number) => {
    const state = getState()
    const overlayVideos = state.videos.filter((v) => v.isOverlay)
    const { x: cx, y: cy, width: cw, height: ch } = cr

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cw / logicalW
    const yScale = ch / logicalH

    overlayVideos.forEach((video) => {
      const localTime = currentTime - video.timestamp
      if (localTime < 0 || localTime >= (video.duration ?? 0)) {
        const vEl = videoElementsRef.current.get(video.id)
        if (vEl && !vEl.paused) vEl.pause()
        return
      }

      const videoEl = videoElementsRef.current.get(video.id)
      if (!videoEl || videoEl.readyState < 2) return

      const targetTime = (video.trimStart ?? 0) + localTime
      
      const isPlaying = getState().isPlaying
      if (isPlaying) {
        if (videoEl.paused && videoEl.readyState >= 2) videoEl.play().catch(() => {})
        if (Math.abs(videoEl.currentTime - targetTime) > 0.15) {
          videoEl.currentTime = targetTime
        }
      } else {
        if (!videoEl.paused) videoEl.pause()
        if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
          videoEl.currentTime = targetTime
        }
      }

      const duration = video.duration ?? 0
      const progress = duration > 0 ? localTime / duration : 0
      ctx.save()
      ctx.globalAlpha = video.opacity
      const cropSx = video.cropSx ?? 0
      const cropSy = video.cropSy ?? 0
      const cropSw = video.cropSw ?? 1
      const cropSh = video.cropSh ?? 1
      applyZoomTransform(ctx, video.zoom, progress, videoEl, cx + video.x * xScale, cy + video.y * yScale, video.width * xScale, video.height * yScale, cropSx, cropSy, cropSw, cropSh, video.zoomIntensity, localTime)
      ctx.restore()
    })
  }, [getState])

  useEffect(() => {
    let currentVideoId: string | null = null
    let lastKnownIsPlaying = false

    const drawOverlays = (ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, t: number) => {
      drawImages(ctx, cr, t, false)
      drawOverlayVideos(ctx, cr, t)
    }

    const setupCanvas = (canvas: HTMLCanvasElement, container: HTMLDivElement) => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const cw = Math.round(rect.width)
      const ch = Math.round(rect.height)
      const cr = applyCanvasSize(canvas, cw, ch)
      const ctx = canvas.getContext('2d')
      return ctx ? { ctx, cr } : null
    }

    let lastTimestamp: number | null = null

    const loop = (timestamp: number) => {
      const state = getState()
      const { playbackTime, isPlaying } = state
      const justStartedPlaying = isPlaying && !lastKnownIsPlaying
      lastKnownIsPlaying = isPlaying
      
      const rate = state.playbackRate ?? 1
      const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0
      lastTimestamp = timestamp

      let newTime = playbackTime
      if (isPlaying) {
        newTime = playbackTime + delta * rate
        const totalDur = state.getTotalDuration()
        if (newTime >= totalDur) {
          state.setIsPlaying(false)
          state.setPlaybackTime(0)
          newTime = 0
          lastTimestamp = null
        } else {
          state.setPlaybackTime(newTime)
        }
      } else {
        lastTimestamp = null
      }

      const { selectedVideoId } = getSelectionState()
      const sorted = [...state.videos].filter((v) => !v.isOverlay).sort((a, b) => a.timestamp - b.timestamp)

      const activeClip = sorted.find((v) => {
        if (!v.duration) return false
        return newTime >= v.timestamp && newTime < v.timestamp + v.duration
      }) || (selectedVideoId ? sorted.find((v) => v.id === selectedVideoId) : sorted[0])

      const canvas = canvasRef.current
      const container = containerRef.current

      // Handle Audio Sync
      const audioEl = audioElementRef.current
      if (audioEl) {
        const audioItem = state.audios?.[0]
        if (audioItem) {
          const audioTrimStart = audioItem.trimStart ?? 0
          const audioTrimEnd = audioItem.trimEnd ?? 0
          const audioOrigDur = audioItem.originalDuration ?? Infinity
          const audioStartTime = audioItem.startTime ?? 0
          const audioActiveEnd = audioOrigDur - audioTrimEnd
          const targetAudioTime = audioTrimStart + Math.max(0, newTime - audioStartTime)

          if (isPlaying) {
            if (audioEl.playbackRate !== rate) audioEl.playbackRate = rate
            if (newTime < audioStartTime || targetAudioTime >= audioActiveEnd) {
              if (!audioEl.paused) audioEl.pause()
            } else {
              if (Math.abs(audioEl.currentTime - targetAudioTime) > 0.2) audioEl.currentTime = targetAudioTime
              if (audioEl.paused && audioEl.readyState >= 2) audioEl.play().catch(() => {})
            }
          } else {
            if (!audioEl.paused) audioEl.pause()
            if (Math.abs(audioEl.currentTime - targetAudioTime) > 0.2) audioEl.currentTime = targetAudioTime
          }
        }
      }

      if (!activeClip || (activeClip.timestamp !== undefined && (newTime < activeClip.timestamp || newTime >= activeClip.timestamp + (activeClip.duration ?? 0)))) {
        // No active video clip at this time (maybe an image or empty space)
        if (currentVideoId) {
          const oldVideo = videoElementsRef.current.get(currentVideoId)
          if (oldVideo) oldVideo.pause()
          currentVideoId = null
        }

        if (canvas && container) {
          const result = setupCanvas(canvas, container)
          if (result) {
            const { ctx, cr } = result
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            drawImages(ctx, cr, newTime, true)
            drawOverlays(ctx, cr, newTime)
            const activeEffect = state.effects?.find((e) => newTime >= e.startTime && newTime < e.endTime)
            if (activeEffect) applyEffect(ctx, activeEffect.type, cr.x, cr.y, cr.width, cr.height, newTime)
          }
        }
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Active Clip Handling
      const videoEl = videoElementsRef.current.get(activeClip.id)
      if (!videoEl) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const trimStart = activeClip.trimStart ?? 0
      const localTimeInOriginal = trimStart + Math.max(0, newTime - activeClip.timestamp)

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
        if (videoEl.playbackRate !== rate) videoEl.playbackRate = rate
        // Sync video to global clock
        if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.15) {
          videoEl.currentTime = localTimeInOriginal
        }
        if (videoEl.paused && videoEl.readyState >= 2) {
          videoEl.play().catch(() => {})
        }
      } else {
        if (!videoEl.paused) videoEl.pause()
        if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.05) {
          videoEl.currentTime = localTimeInOriginal
        }
      }

      const videoRect = drawVideoToCanvas(videoEl, activeClip, newTime)
      if (videoRect && canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          drawOverlays(ctx, videoRect, newTime)
          const activeEffect = state.effects?.find((e) => newTime >= e.startTime && newTime < e.endTime)
          if (activeEffect) applyEffect(ctx, activeEffect.type, videoRect.x, videoRect.y, videoRect.width, videoRect.height, newTime)
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
  }, [getState, getSelectionState, drawVideoToCanvas, drawImages, drawOverlayVideos, canvasRef, applyCanvasSize])

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

  return { contentRect }
}
