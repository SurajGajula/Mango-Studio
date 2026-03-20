'use client'

import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useVideoPlayback } from '@/app/lib/useVideoPlayback'
import { usePreviewInteractions } from '@/app/hooks/preview/usePreviewInteractions'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import styles from './PreviewArea.module.css'
import TextOverlay from './TextOverlay'
import CropEditor from './CropEditor'

interface OverlayItemProps {
  itemId: string
  itemType: 'image' | 'video'
  x: number
  y: number
  w: number
  h: number
  isSelected: boolean
  offsetX: number
  offsetY: number
  xScale: number
  yScale: number
  handleOverlayMouseDown: (itemId: string, itemType: 'image' | 'video', mode: any, e: React.MouseEvent) => void
  hasCrop: boolean
  cropEditId: string | null
  enterCropEdit: (id: string, type: 'image' | 'video') => void
  exitCropEdit: () => void
  children?: React.ReactNode
}

const OverlayItem = memo(({
  itemId, itemType, x, y, w, h, isSelected,
  offsetX, offsetY, xScale, yScale,
  handleOverlayMouseDown, hasCrop, cropEditId,
  enterCropEdit, exitCropEdit, children
}: OverlayItemProps) => {
  const px = offsetX + x * xScale
  const py = offsetY + y * yScale
  const pw = w * xScale
  const ph = h * yScale

  const handleDoubleClick = useCallback(() => {
    if (!hasCrop) return
    if (cropEditId === itemId) exitCropEdit()
    else enterCropEdit(itemId, itemType)
  }, [hasCrop, cropEditId, itemId, itemType, enterCropEdit, exitCropEdit])

  return (
    <div
      className={`${styles.imageOverlay} ${isSelected ? styles.selected : ''}`}
      style={{ left: px, top: py, width: pw, height: ph }}
      onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'move', e)}
      onDoubleClick={handleDoubleClick}
    >
      {children}
    </div>
  )
})

OverlayItem.displayName = 'OverlayItem'

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const editingContentRef = useRef('')
  const textRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const measureCanvas = useRef<HTMLCanvasElement | null>(null)

  const getMeasureCtx = useCallback((): CanvasRenderingContext2D => {
    if (!measureCanvas.current) measureCanvas.current = document.createElement('canvas')
    return measureCanvas.current.getContext('2d')!
  }, [])

  const { contentRect } = useVideoPlayback(canvasRef, containerRef)

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)
  const updateImage = useManifestStore((state) => state.updateImage)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateText = useManifestStore((state) => state.updateText)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const setAspectRatio = useManifestStore((state) => state.setAspectRatio)

  const mainVideos = videos.filter((v) => !v.isOverlay)
  const hasMainContent = mainVideos.length > 0 || images.length > 0
  const canChangeAspectRatio = !hasMainContent

  const logicalW = aspectRatio === '16:9' ? 1920 : 1080
  const logicalH = aspectRatio === '16:9' ? 1080 : 1920
  const xScale = contentRect.width > 0 ? contentRect.width / logicalW : 1
  const yScale = contentRect.height > 0 ? contentRect.height / logicalH : 1
  const offsetX = contentRect.x
  const offsetY = contentRect.y

  const {
    snapLines,
    cropEditId,
    cropPanState,
    setCropPanState,
    enterCropEdit,
    exitCropEdit,
    handleOverlayMouseDown,
    handleTextMouseDown,
    handleTextResizeStart
  } = usePreviewInteractions(
    aspectRatio, xScale, yScale, offsetX, offsetY,
    images, videos, texts,
    updateImage, updateVideo, updateText, pushHistory,
    selectedImageId, setSelectedImageId,
    selectedVideoId, setSelectedVideoId,
    selectedTextId, setSelectedTextId,
    canvasRef, textRefs, getMeasureCtx
  )

  const activeImages = useMemo(() => images.filter(
    (image) => !image.isMainTrack && playbackTime >= image.startTime && playbackTime < image.endTime
  ), [images, playbackTime])

  const activeOverlayVideos = useMemo(() => videos.filter(
    (v) => v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0)
  ), [videos, playbackTime])

  const activeTexts = useMemo(() => texts.filter(
    (t) => playbackTime >= t.startTime && playbackTime < t.endTime
  ), [texts, playbackTime])

  const handleCropPanStart = useCallback((e: React.MouseEvent) => {
    if (!cropEditId) return
    e.preventDefault()
    
    const img = images.find((i) => i.id === cropEditId)
    const vid = videos.find((v) => v.id === cropEditId)
    const item = img || vid
    if (!item) return

    const itemW = item.width
    const itemH = item.height
    const itemX = item.x
    const itemY = item.y

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (canvasRect) {
      const px = e.clientX - canvasRect.left
      const py = e.clientY - canvasRect.top
      
      const destX = itemX * xScale + offsetX
      const destY = itemY * yScale + offsetY
      const destW = itemW * xScale
      const destH = itemH * yScale

      const fullImgW = destW / item.cropSw
      const fullImgH = destH / item.cropSh
      const fullImgLeft = destX - item.cropSx * fullImgW
      const fullImgTop = destY - item.cropSy * fullImgH

      if (px < fullImgLeft || px > fullImgLeft + fullImgW || py < fullImgTop || py > fullImgTop + fullImgH) {
        exitCropEdit()
        return
      }
    }

    setCropPanState({
      startX: e.clientX,
      startY: e.clientY,
      startCropSx: item.cropSx,
      startCropSy: item.cropSy,
      cropSw: item.cropSw,
      cropSh: item.cropSh,
      destW: item.width * xScale,
      destH: item.height * yScale,
    })
  }, [cropEditId, images, videos, xScale, yScale, offsetX, offsetY, exitCropEdit, setCropPanState])

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    // Check overlay videos first
    const visibleOverlayVideos = videos.filter(
      (v) => v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0)
    )
    for (const vid of visibleOverlayVideos) {
      const vx = vid.x * xScale + offsetX
      const vy = vid.y * yScale + offsetY
      const vw = vid.width * xScale
      const vh = vid.height * yScale
      if (px >= vx && px <= vx + vw && py >= vy && py <= vy + vh) {
        enterCropEdit(vid.id, 'video')
        return
      }
    }

    const visibleImages = images.filter(
      (img) => playbackTime >= img.startTime && playbackTime < img.endTime
    )
    for (const img of visibleImages) {
      const ix = img.x * xScale + offsetX
      const iy = img.y * yScale + offsetY
      const iw = img.width * xScale
      const ih = img.height * yScale
      if (px >= ix && px <= ix + iw && py >= iy && py <= iy + ih) {
        enterCropEdit(img.id, 'image')
        return
      }
    }

    // Check main video
    const mainVideo = videos.find((v) => !v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0))
    if (mainVideo) {
      if (px >= offsetX && px <= offsetX + contentRect.width && py >= offsetY && py <= offsetY + contentRect.height) {
        enterCropEdit(mainVideo.id, 'video')
        return
      }
    }
  }, [images, videos, playbackTime, xScale, yScale, offsetX, offsetY, contentRect, enterCropEdit])

  useEffect(() => {
    if (!cropEditId) return
    const handleMouseDown = (e: MouseEvent) => {
      const container = containerRef.current
      if (container && !container.contains(e.target as Node)) {
        exitCropEdit()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [cropEditId, exitCropEdit])

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {hasMainContent ? (
          <div ref={containerRef} className={styles.videoContainer}>
            <div className={styles.canvasWrapper}>
              <canvas
                ref={canvasRef}
                className={styles.video}
                onClick={() => { setSelectedImageId(null); setSelectedVideoId(null); setSelectedTextId(null); setEditingTextId(null); if (cropEditId) exitCropEdit() }}
                onDoubleClick={handleCanvasDoubleClick}
              />
              <div className={styles.overlayLayer}>
                {activeImages.map((image) => (
                  <OverlayItem
                    key={image.id}
                    itemId={image.id}
                    itemType="image"
                    x={image.x}
                    y={image.y}
                    w={image.width}
                    h={image.height}
                    isSelected={selectedImageId === image.id}
                    offsetX={offsetX}
                    offsetY={offsetY}
                    xScale={xScale}
                    yScale={yScale}
                    handleOverlayMouseDown={handleOverlayMouseDown}
                    hasCrop={!!image.cropAspect}
                    cropEditId={cropEditId}
                    enterCropEdit={enterCropEdit}
                    exitCropEdit={exitCropEdit}
                  />
                ))}
                {activeOverlayVideos.map((video) => (
                  <OverlayItem
                    key={video.id}
                    itemId={video.id}
                    itemType="video"
                    x={video.x}
                    y={video.y}
                    w={video.width}
                    h={video.height}
                    isSelected={selectedVideoId === video.id}
                    offsetX={offsetX}
                    offsetY={offsetY}
                    xScale={xScale}
                    yScale={yScale}
                    handleOverlayMouseDown={handleOverlayMouseDown}
                    hasCrop={!!video.cropAspect}
                    cropEditId={cropEditId}
                    enterCropEdit={enterCropEdit}
                    exitCropEdit={exitCropEdit}
                  />
                ))}
                {activeTexts.map((text) => (
                  <TextOverlay
                    key={text.id}
                    text={text}
                    xScale={xScale}
                    yScale={yScale}
                    offsetX={offsetX}
                    offsetY={offsetY}
                    editingTextId={editingTextId}
                    setEditingTextId={setEditingTextId}
                    editingContent={editingContent}
                    setEditingContent={setEditingContent}
                    editingContentRef={editingContentRef}
                    handleTextMouseDown={handleTextMouseDown}
                    handleTextResizeStart={handleTextResizeStart}
                    getMeasureCtx={getMeasureCtx}
                    playbackTime={playbackTime}
                    textRefs={textRefs}
                  />
                ))}
                {snapLines.vertical.map((x, i) => (
                  <div key={`v-${i}`} className={styles.snapLineVertical} style={{ left: offsetX + x * xScale }} />
                ))}
                {snapLines.horizontal.map((y, i) => (
                  <div key={`h-${i}`} className={styles.snapLineHorizontal} style={{ top: offsetY + y * yScale }} />
                ))}
              </div>
              {cropEditId && (
                <CropEditor
                  cropEditId={cropEditId}
                  xScale={xScale}
                  yScale={yScale}
                  offsetX={offsetX}
                  offsetY={offsetY}
                  contentRect={contentRect}
                  playbackTime={playbackTime}
                  cropPanState={cropPanState}
                  handleCropPanStart={handleCropPanStart}
                  exitCropEdit={exitCropEdit}
                />
              )}
            </div>
          </div>
        ) : (
          <div className={styles.previewContent}>
            <div className={styles.aspectSelector}>
              <button
                className={`${styles.aspectButton} ${aspectRatio === '9:16' ? styles.active : ''}`}
                onClick={() => setAspectRatio('9:16')}
                disabled={!canChangeAspectRatio}
              >
                9:16
              </button>
              <button
                className={`${styles.aspectButton} ${aspectRatio === '16:9' ? styles.active : ''}`}
                onClick={() => setAspectRatio('16:9')}
                disabled={!canChangeAspectRatio}
              >
                16:9
              </button>
            </div>
            <p>Generate a video in the chat</p>
          </div>
        )}
      </div>
    </div>
  )
}
