'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './PreviewArea.module.css'

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const rafRef = useRef<number | null>(null)

  const getState = useManifestStore.getState
  const videos = useManifestStore((state) => state.videos)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const setAspectRatio = useManifestStore((state) => state.setAspectRatio)

  const canChangeAspectRatio = videos.length === 0

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
      if (!videoElementsRef.current.has(clip.id)) {
        const video = document.createElement('video')
        video.preload = 'auto'
        video.playsInline = true
        video.muted = false
        video.src = clip.url
        
        video.onloadedmetadata = () => {
          if (video.duration && (!clip.duration || Math.abs(clip.duration - video.duration) > 0.1)) {
            useManifestStore.getState().updateVideo(clip.id, { duration: video.duration })
          }
        }
        
        videoElementsRef.current.set(clip.id, video)
      }
    })
  }, [videos])

  const drawVideoToCanvas = useCallback((video: HTMLVideoElement): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return false
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    const targetAspect = aspectRatio === '16:9' ? 16 / 9 : 9 / 16
    
    const container = canvas.parentElement
    if (container) {
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
      }
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    return true
  }, [aspectRatio])

  useEffect(() => {
    let currentVideoId: string | null = null

    const loop = () => {
      const state = getState()
      const { playbackTime, isPlaying, selectedVideoId } = state
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
        
        if (state.selectedVideoId !== activeClip.id) {
          state.setSelectedVideoId(activeClip.id)
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
            state.setSelectedVideoId(nextClip.id)
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

      drawVideoToCanvas(videoEl)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [getState, drawVideoToCanvas])

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

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {videos.length > 0 ? (
          <div className={styles.videoContainer}>
            <canvas ref={canvasRef} className={styles.video} />
          </div>
        ) : (
          <div className={styles.previewContent}>
            <div className={styles.aspectSelector}>
              <button
                className={`${styles.aspectButton} ${aspectRatio === '16:9' ? styles.active : ''}`}
                onClick={() => setAspectRatio('16:9')}
                disabled={!canChangeAspectRatio}
              >
                16:9
              </button>
              <button
                className={`${styles.aspectButton} ${aspectRatio === '9:16' ? styles.active : ''}`}
                onClick={() => setAspectRatio('9:16')}
                disabled={!canChangeAspectRatio}
              >
                9:16
              </button>
            </div>
            <p>Generate a video in the chat</p>
          </div>
        )}
      </div>
    </div>
  )
}
