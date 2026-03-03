'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './PreviewArea.module.css'

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number | null>(null)
  
  const [dragState, setDragState] = useState<{
    imageId: string
    mode: DragMode
    startX: number
    startY: number
    initialX: number
    initialY: number
    initialWidth: number
    initialHeight: number
  } | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 })
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })

  const getState = useManifestStore.getState
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const selectedImageId = useManifestStore((state) => state.selectedImageId)
  const setSelectedImageId = useManifestStore((state) => state.setSelectedImageId)
  const updateImage = useManifestStore((state) => state.updateImage)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const setAspectRatio = useManifestStore((state) => state.setAspectRatio)

  const canChangeAspectRatio = videos.length === 0
  
  const activeImages = images.filter(
    (image) => playbackTime >= image.startTime && playbackTime < image.endTime
  )

  const scale = canvasDimensions.width > 0 ? Math.min(canvasDimensions.width / 1920, canvasDimensions.height / 1080) : 1

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
          if (video.duration && (!clip.duration || Math.abs(clip.duration - video.duration) > 0.1)) {
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
  }, [aspectRatio])

  const handleImageMouseDown = useCallback((imageId: string, mode: DragMode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (selectedImageId !== imageId) {
      setSelectedImageId(imageId)
      return
    }
    
    const image = images.find((img) => img.id === imageId)
    if (!image) return
    
    setDragState({
      imageId,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialX: image.x,
      initialY: image.y,
      initialWidth: image.width,
      initialHeight: image.height,
    })
  }, [images, selectedImageId, setSelectedImageId])

  const SNAP_THRESHOLD = 10
  const CANVAS_WIDTH = 1920
  const CANVAS_HEIGHT = 1080

  useEffect(() => {
    if (!dragState) {
      setSnapLines({ horizontal: [], vertical: [] })
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (scale === 0) return

      const deltaX = (e.clientX - dragState.startX) / scale
      const deltaY = (e.clientY - dragState.startY) / scale

      const snapTargetsX = [0, CANVAS_WIDTH / 2, CANVAS_WIDTH]
      const snapTargetsY = [0, CANVAS_HEIGHT / 2, CANVAS_HEIGHT]

      if (dragState.mode === 'move') {
        let newX = dragState.initialX + deltaX
        let newY = dragState.initialY + deltaY
        const width = dragState.initialWidth
        const height = dragState.initialHeight

        const activeSnapLinesV: number[] = []
        const activeSnapLinesH: number[] = []

        const leftEdge = newX
        const rightEdge = newX + width
        const centerX = newX + width / 2
        const topEdge = newY
        const bottomEdge = newY + height
        const centerY = newY + height / 2

        for (const target of snapTargetsX) {
          if (Math.abs(leftEdge - target) < SNAP_THRESHOLD) {
            newX = target
            activeSnapLinesV.push(target)
          } else if (Math.abs(rightEdge - target) < SNAP_THRESHOLD) {
            newX = target - width
            activeSnapLinesV.push(target)
          } else if (Math.abs(centerX - target) < SNAP_THRESHOLD) {
            newX = target - width / 2
            activeSnapLinesV.push(target)
          }
        }

        for (const target of snapTargetsY) {
          if (Math.abs(topEdge - target) < SNAP_THRESHOLD) {
            newY = target
            activeSnapLinesH.push(target)
          } else if (Math.abs(bottomEdge - target) < SNAP_THRESHOLD) {
            newY = target - height
            activeSnapLinesH.push(target)
          } else if (Math.abs(centerY - target) < SNAP_THRESHOLD) {
            newY = target - height / 2
            activeSnapLinesH.push(target)
          }
        }

        setSnapLines({ horizontal: activeSnapLinesH, vertical: activeSnapLinesV })
        updateImage(dragState.imageId, { x: newX, y: newY })
      } else if (dragState.mode === 'resize-se') {
        updateImage(dragState.imageId, {
          width: Math.max(50, dragState.initialWidth + deltaX),
          height: Math.max(50, dragState.initialHeight + deltaY),
        })
      } else if (dragState.mode === 'resize-sw') {
        const newWidth = Math.max(50, dragState.initialWidth - deltaX)
        updateImage(dragState.imageId, {
          x: dragState.initialX + (dragState.initialWidth - newWidth),
          width: newWidth,
          height: Math.max(50, dragState.initialHeight + deltaY),
        })
      } else if (dragState.mode === 'resize-ne') {
        const newHeight = Math.max(50, dragState.initialHeight - deltaY)
        updateImage(dragState.imageId, {
          y: dragState.initialY + (dragState.initialHeight - newHeight),
          width: Math.max(50, dragState.initialWidth + deltaX),
          height: newHeight,
        })
      } else if (dragState.mode === 'resize-nw') {
        const newWidth = Math.max(50, dragState.initialWidth - deltaX)
        const newHeight = Math.max(50, dragState.initialHeight - deltaY)
        updateImage(dragState.imageId, {
          x: dragState.initialX + (dragState.initialWidth - newWidth),
          y: dragState.initialY + (dragState.initialHeight - newHeight),
          width: newWidth,
          height: newHeight,
        })
      }
    }

    const handleMouseUp = () => {
      setDragState(null)
      setSnapLines({ horizontal: [], vertical: [] })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, scale, updateImage])

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

      const x = image.x * scale
      const y = image.y * scale
      const width = image.width * scale
      const height = image.height * scale

      ctx.drawImage(img, x, y, width, height)
      ctx.restore()
    })
  }, [getState])

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

  const renderImageOverlays = () => {
    if (canvasDimensions.width === 0) return null

    return activeImages.map((image) => {
      const isSelected = selectedImageId === image.id
      const x = image.x * scale
      const y = image.y * scale
      const width = image.width * scale
      const height = image.height * scale

      return (
        <div
          key={image.id}
          className={`${styles.imageOverlay} ${isSelected ? styles.selected : ''}`}
          style={{
            left: x,
            top: y,
            width,
            height,
          }}
          onMouseDown={(e) => handleImageMouseDown(image.id, 'move', e)}
        >
          {isSelected && (
            <>
              <div
                className={`${styles.resizeHandle} ${styles.nw}`}
                onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-nw', e)}
              />
              <div
                className={`${styles.resizeHandle} ${styles.ne}`}
                onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-ne', e)}
              />
              <div
                className={`${styles.resizeHandle} ${styles.sw}`}
                onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-sw', e)}
              />
              <div
                className={`${styles.resizeHandle} ${styles.se}`}
                onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-se', e)}
              />
            </>
          )}
        </div>
      )
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {videos.length > 0 ? (
          <div ref={containerRef} className={styles.videoContainer}>
            <div className={styles.canvasWrapper}>
              <canvas 
                ref={canvasRef} 
                className={styles.video} 
                onClick={() => setSelectedImageId(null)}
              />
              <div className={styles.overlayLayer}>
                {renderImageOverlays()}
                {snapLines.vertical.map((x, i) => (
                  <div
                    key={`v-${i}`}
                    className={styles.snapLineVertical}
                    style={{ left: x * scale }}
                  />
                ))}
                {snapLines.horizontal.map((y, i) => (
                  <div
                    key={`h-${i}`}
                    className={styles.snapLineHorizontal}
                    style={{ top: y * scale }}
                  />
                ))}
              </div>
            </div>
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
