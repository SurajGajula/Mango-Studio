'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useVideoPlayback } from '@/app/lib/useVideoPlayback'
import styles from './PreviewArea.module.css'

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })

  const { canvasDimensions } = useVideoPlayback(canvasRef, containerRef)

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const updateImage = useManifestStore((state) => state.updateImage)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const setAspectRatio = useManifestStore((state) => state.setAspectRatio)

  const canChangeAspectRatio = videos.length === 0

  const activeImages = images.filter(
    (image) => playbackTime >= image.startTime && playbackTime < image.endTime
  )

  const scale = canvasDimensions.width > 0 ? Math.min(canvasDimensions.width / 1920, canvasDimensions.height / 1080) : 1

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

  useEffect(() => {
    if (!dragState) {
      setSnapLines({ horizontal: [], vertical: [] })
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (scale === 0) return

      const deltaX = (e.clientX - dragState.startX) / scale
      const deltaY = (e.clientY - dragState.startY) / scale

      const logicalWidth = canvasDimensions.width / scale
      const logicalHeight = canvasDimensions.height / scale
      const snapTargetsX = [0, logicalWidth / 2, logicalWidth]
      const snapTargetsY = [0, logicalHeight / 2, logicalHeight]

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
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, scale, canvasDimensions, updateImage, pushHistory])

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
          style={{ left: x, top: y, width, height }}
          onMouseDown={(e) => handleImageMouseDown(image.id, 'move', e)}
        >
          {isSelected && (
            <>
              <div className={`${styles.resizeHandle} ${styles.nw}`} onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-nw', e)} />
              <div className={`${styles.resizeHandle} ${styles.ne}`} onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-ne', e)} />
              <div className={`${styles.resizeHandle} ${styles.sw}`} onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-sw', e)} />
              <div className={`${styles.resizeHandle} ${styles.se}`} onMouseDown={(e) => handleImageMouseDown(image.id, 'resize-se', e)} />
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
                  <div key={`v-${i}`} className={styles.snapLineVertical} style={{ left: x * scale }} />
                ))}
                {snapLines.horizontal.map((y, i) => (
                  <div key={`h-${i}`} className={styles.snapLineHorizontal} style={{ top: y * scale }} />
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
