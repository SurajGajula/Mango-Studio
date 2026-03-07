'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useVideoPlayback } from '@/app/lib/useVideoPlayback'
import styles from './PreviewArea.module.css'

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null

interface OverlayDragState {
  itemId: string
  itemType: 'image' | 'video'
  mode: DragMode
  startX: number
  startY: number
  initialX: number
  initialY: number
  initialWidth: number
  initialHeight: number
}

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [dragState, setDragState] = useState<OverlayDragState | null>(null)
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })

  const { canvasDimensions } = useVideoPlayback(canvasRef, containerRef)

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const updateImage = useManifestStore((state) => state.updateImage)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const setAspectRatio = useManifestStore((state) => state.setAspectRatio)

  const mainVideos = videos.filter((v) => !v.isOverlay)
  const hasMainContent = mainVideos.length > 0 || images.length > 0
  const canChangeAspectRatio = !hasMainContent

  const activeImages = images.filter(
    (image) => !image.isMainTrack && playbackTime >= image.startTime && playbackTime < image.endTime
  )

  const activeOverlayVideos = videos.filter(
    (v) => v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0)
  )

  const xScale = canvasDimensions.width > 0 ? canvasDimensions.width / 1920 : 1
  const yScale = canvasDimensions.height > 0 ? canvasDimensions.height / 1080 : 1

  const applyUpdate = useCallback((itemId: string, itemType: 'image' | 'video', updates: { x?: number; y?: number; width?: number; height?: number }) => {
    if (itemType === 'image') updateImage(itemId, updates)
    else updateVideo(itemId, updates)
  }, [updateImage, updateVideo])

  const handleOverlayMouseDown = useCallback((itemId: string, itemType: 'image' | 'video', mode: DragMode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const isSelectedItem = itemType === 'image' ? selectedImageId === itemId : selectedVideoId === itemId
    if (!isSelectedItem) {
      if (itemType === 'image') { setSelectedImageId(itemId); setSelectedVideoId(null) }
      else { setSelectedVideoId(itemId); setSelectedImageId(null) }
      return
    }

    let initialX = 0, initialY = 0, initialWidth = 0, initialHeight = 0
    if (itemType === 'image') {
      const img = images.find((i) => i.id === itemId)
      if (!img) return
      initialX = img.x; initialY = img.y; initialWidth = img.width; initialHeight = img.height
    } else {
      const vid = videos.find((v) => v.id === itemId)
      if (!vid) return
      initialX = vid.x; initialY = vid.y; initialWidth = vid.width; initialHeight = vid.height
    }

    setDragState({ itemId, itemType, mode, startX: e.clientX, startY: e.clientY, initialX, initialY, initialWidth, initialHeight })
  }, [images, videos, selectedImageId, selectedVideoId, setSelectedImageId, setSelectedVideoId])

  const SNAP_THRESHOLD = 10

  useEffect(() => {
    if (!dragState) {
      setSnapLines({ horizontal: [], vertical: [] })
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (xScale === 0 || yScale === 0) return

      const deltaX = (e.clientX - dragState.startX) / xScale
      const deltaY = (e.clientY - dragState.startY) / yScale

      const snapTargetsX = [0, 960, 1920]
      const snapTargetsY = [0, 540, 1080]

      if (dragState.mode === 'move') {
        let newX = dragState.initialX + deltaX
        let newY = dragState.initialY + deltaY
        const width = dragState.initialWidth
        const height = dragState.initialHeight

        const activeSnapLinesV: number[] = []
        const activeSnapLinesH: number[] = []

        for (const target of snapTargetsX) {
          if (Math.abs(newX - target) < SNAP_THRESHOLD) { newX = target; activeSnapLinesV.push(target) }
          else if (Math.abs(newX + width - target) < SNAP_THRESHOLD) { newX = target - width; activeSnapLinesV.push(target) }
          else if (Math.abs(newX + width / 2 - target) < SNAP_THRESHOLD) { newX = target - width / 2; activeSnapLinesV.push(target) }
        }

        for (const target of snapTargetsY) {
          if (Math.abs(newY - target) < SNAP_THRESHOLD) { newY = target; activeSnapLinesH.push(target) }
          else if (Math.abs(newY + height - target) < SNAP_THRESHOLD) { newY = target - height; activeSnapLinesH.push(target) }
          else if (Math.abs(newY + height / 2 - target) < SNAP_THRESHOLD) { newY = target - height / 2; activeSnapLinesH.push(target) }
        }

        setSnapLines({ horizontal: activeSnapLinesH, vertical: activeSnapLinesV })
        applyUpdate(dragState.itemId, dragState.itemType, { x: newX, y: newY })
      } else if (dragState.mode === 'resize-se') {
        applyUpdate(dragState.itemId, dragState.itemType, {
          width: Math.max(50, dragState.initialWidth + deltaX),
          height: Math.max(50, dragState.initialHeight + deltaY),
        })
      } else if (dragState.mode === 'resize-sw') {
        const newWidth = Math.max(50, dragState.initialWidth - deltaX)
        applyUpdate(dragState.itemId, dragState.itemType, {
          x: dragState.initialX + (dragState.initialWidth - newWidth),
          width: newWidth,
          height: Math.max(50, dragState.initialHeight + deltaY),
        })
      } else if (dragState.mode === 'resize-ne') {
        const newHeight = Math.max(50, dragState.initialHeight - deltaY)
        applyUpdate(dragState.itemId, dragState.itemType, {
          y: dragState.initialY + (dragState.initialHeight - newHeight),
          width: Math.max(50, dragState.initialWidth + deltaX),
          height: newHeight,
        })
      } else if (dragState.mode === 'resize-nw') {
        const newWidth = Math.max(50, dragState.initialWidth - deltaX)
        const newHeight = Math.max(50, dragState.initialHeight - deltaY)
        applyUpdate(dragState.itemId, dragState.itemType, {
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
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, xScale, yScale, applyUpdate, pushHistory])

  const renderOverlayItem = (
    itemId: string,
    itemType: 'image' | 'video',
    x: number, y: number, w: number, h: number,
    isSelected: boolean,
    children: React.ReactNode
  ) => {
    const px = x * xScale
    const py = y * yScale
    const pw = w * xScale
    const ph = h * yScale

    return (
      <div
        key={itemId}
        className={`${styles.imageOverlay} ${isSelected ? styles.selected : ''}`}
        style={{ left: px, top: py, width: pw, height: ph }}
        onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'move', e)}
      >
        {children}
        {isSelected && (
          <>
            <div className={`${styles.resizeHandle} ${styles.nw}`} onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'resize-nw', e)} />
            <div className={`${styles.resizeHandle} ${styles.ne}`} onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'resize-ne', e)} />
            <div className={`${styles.resizeHandle} ${styles.sw}`} onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'resize-sw', e)} />
            <div className={`${styles.resizeHandle} ${styles.se}`} onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'resize-se', e)} />
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {hasMainContent ? (
          <div ref={containerRef} className={styles.videoContainer}>
            <div className={styles.canvasWrapper}>
              <canvas
                ref={canvasRef}
                className={styles.video}
                onClick={() => { setSelectedImageId(null); setSelectedVideoId(null) }}
              />
              <div className={styles.overlayLayer}>
                {activeImages.map((image) =>
                  renderOverlayItem(
                    image.id, 'image',
                    image.x, image.y, image.width, image.height,
                    selectedImageId === image.id,
                    null
                  )
                )}
                {activeOverlayVideos.map((video) =>
                  renderOverlayItem(
                    video.id, 'video',
                    video.x, video.y, video.width, video.height,
                    selectedVideoId === video.id,
                    null
                  )
                )}
                {snapLines.vertical.map((x, i) => (
                  <div key={`v-${i}`} className={styles.snapLineVertical} style={{ left: x * xScale }} />
                ))}
                {snapLines.horizontal.map((y, i) => (
                  <div key={`h-${i}`} className={styles.snapLineHorizontal} style={{ top: y * yScale }} />
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
