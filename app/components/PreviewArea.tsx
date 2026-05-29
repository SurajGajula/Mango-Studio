'use client'

import { useEffect, useRef, useCallback, useState, useMemo, memo, type CSSProperties } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useVideoPlayback } from '@/app/lib/useVideoPlayback'
import { useLivePlaybackTime } from '@/app/hooks/useLivePlaybackTime'
import { usePreviewInteractions } from '@/app/hooks/preview/usePreviewInteractions'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { TextClass } from '@/app/models/TextClass'
import { getEffectiveCropForEdit } from '@/app/lib/cropKeyframeHelpers'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
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
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
  isSelected: boolean
  offsetX: number
  offsetY: number
  xScale: number
  yScale: number
  handleOverlayMouseDown: (itemId: string, itemType: 'image' | 'video', mode: any, e: React.MouseEvent) => void
  handleOverlayContextMenu: (itemId: string, itemType: 'image' | 'video', e: React.MouseEvent) => void
  handleImageRotationMouseDown?: (itemId: string, e: React.MouseEvent) => void
  showRotateHandle: boolean
  hasCrop: boolean
  cropEditId: string | null
  enterCropEdit: (id: string, type: 'image' | 'video') => void
  exitCropEdit: () => void
  children?: React.ReactNode
}

const OverlayItem = memo(({
  itemId, itemType, x, y, w, h, rotation, flipHorizontal, flipVertical, isSelected,
  offsetX, offsetY, xScale, yScale,
  handleOverlayMouseDown, handleOverlayContextMenu, handleImageRotationMouseDown, showRotateHandle, hasCrop, cropEditId,
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

  const rot = rotation ?? 0
  const sx = flipHorizontal ? -1 : 1
  const sy = flipVertical ? -1 : 1
  const parts: string[] = []
  if (rot !== 0) parts.push(`rotate(${rot}deg)`)
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`)
  const overlayStyle: CSSProperties = {
    left: px,
    top: py,
    width: pw,
    height: ph,
    ...(parts.length > 0
      ? { transform: parts.join(' '), transformOrigin: `${pw / 2}px ${ph / 2}px` }
      : {}),
  }

  return (
    <div
      className={`${styles.imageOverlay} ${isSelected ? styles.selected : ''}`}
      style={overlayStyle}
      onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'move', e)}
      onContextMenu={(e) => handleOverlayContextMenu(itemId, itemType, e)}
      onDoubleClick={handleDoubleClick}
    >
      {itemType === 'image' && showRotateHandle && handleImageRotationMouseDown && (
        <div
          className={styles.imageRotateHandle}
          onMouseDown={(e) => handleImageRotationMouseDown(itemId, e)}
        />
      )}
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

  const { contentRect } = useVideoPlayback(canvasRef, containerRef, editingTextId, true)

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const playbackTime = useLivePlaybackTime(12)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)
  const selectImage = useSelectionStore((state) => state.selectImage)
  const selectVideo = useSelectionStore((state) => state.selectVideo)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)
  const selectedKeyframeId = useSelectionStore((state) => state.selectedKeyframeId)
  const updateImage = useManifestStore((state) => state.updateImage)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateText = useManifestStore((state) => state.updateText)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = FIXED_ASPECT_RATIO

  const mainVideos = videos.filter((v) => v.row === 0)
  const hasMainContent = mainVideos.length > 0 || images.length > 0

  const logicalW = 1080
  const logicalH = 1920
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
    handleImageRotationMouseDown,
    handleTextMouseDown,
    handleTextResizeStart
  } = usePreviewInteractions(
    aspectRatio, xScale, yScale, offsetX, offsetY,
    images, videos, texts,
    playbackTime,
    updateImage, updateVideo, updateText, pushHistory,
    selectedImageId, setSelectedImageId,
    selectedVideoId, setSelectedVideoId,
    selectedTextId, setSelectedTextId,
    canvasRef, textRefs, getMeasureCtx
  )

  const sortedPreviewLayers = useMemo(() => {
    type Layer =
      | { kind: 'image'; row: number; t0: number; image: ImageClass }
      | { kind: 'video'; row: number; t0: number; video: VideoClass }
      | { kind: 'text'; row: number; t0: number; text: TextClass }
    const layers: Layer[] = []
    for (const image of images) {
      if (playbackTime < image.startTime || playbackTime >= image.endTime) continue
      layers.push({ kind: 'image', row: image.row, t0: image.startTime, image })
    }
    for (const video of videos) {
      const vdur = manifestVideoTimelineSpanSeconds(video)
      if (vdur <= 0) continue
      if (playbackTime < video.timestamp || playbackTime >= video.timestamp + vdur) continue
      layers.push({ kind: 'video', row: video.row, t0: video.timestamp, video })
    }
    for (const text of texts) {
      if (playbackTime < text.startTime || playbackTime >= text.endTime) continue
      layers.push({ kind: 'text', row: text.row, t0: text.startTime, text })
    }
    layers.sort((a, b) => a.row - b.row || a.t0 - b.t0)
    return layers
  }, [images, videos, texts, playbackTime])

  const handleCropPanStart = useCallback((e: React.PointerEvent) => {
    if (!cropEditId) return
    e.preventDefault()
    e.stopPropagation()
    
    const state = useManifestStore.getState()
    const img = state.images.find((i) => i.id === cropEditId)
    const vid = state.videos.find((v) => v.id === cropEditId)
    const item = img || vid
    if (!item) return

    const itemW = item.width
    const itemH = item.height
    const eff = getEffectiveCropForEdit(item, selectedKeyframeId, playbackTime)

    setCropPanState({
      startX: e.clientX,
      startY: e.clientY,
      startCropSx: eff.cropSx ?? 0,
      startCropSy: eff.cropSy ?? 0,
      cropSw: eff.cropSw ?? 1,
      cropSh: eff.cropSh ?? 1,
      destW: itemW * xScale,
      destH: itemH * yScale,
    })
  }, [cropEditId, selectedKeyframeId, playbackTime, xScale, yScale, setCropPanState])

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    const topFirst = [...sortedPreviewLayers].reverse()
    for (let i = 0; i < topFirst.length; i++) {
      const layer = topFirst[i]
      if (layer.kind === 'video') {
        const vid = layer.video
        const kf = resolveMediaKeyframeTransform(vid, playbackTime - vid.timestamp, manifestVideoTimelineSpanSeconds(vid))
        const vx = kf.x * xScale + offsetX
        const vy = kf.y * yScale + offsetY
        const vw = kf.width * xScale
        const vh = kf.height * yScale
        if (px >= vx && px <= vx + vw && py >= vy && py <= vy + vh) {
          enterCropEdit(vid.id, 'video')
          return
        }
      } else if (layer.kind === 'image') {
        const img = layer.image
        const kf = resolveMediaKeyframeTransform(img, playbackTime - img.startTime, img.duration)
        const ix = kf.x * xScale + offsetX
        const iy = kf.y * yScale + offsetY
        const iw = kf.width * xScale
        const ih = kf.height * yScale
        if (px >= ix && px <= ix + iw && py >= iy && py <= iy + ih) {
          enterCropEdit(img.id, 'image')
          return
        }
      }
    }

    // Check main video
    const mainVideo = videos.find(
      (v) =>
        v.row === 0 &&
        playbackTime >= v.timestamp &&
        playbackTime < v.timestamp + manifestVideoTimelineSpanSeconds(v)
    )
    if (mainVideo) {
      if (px >= offsetX && px <= offsetX + contentRect.width && py >= offsetY && py <= offsetY + contentRect.height) {
        enterCropEdit(mainVideo.id, 'video')
        return
      }
    }
  }, [videos, sortedPreviewLayers, playbackTime, xScale, yScale, offsetX, offsetY, contentRect, enterCropEdit])

  const handleOverlayContextMenu = useCallback(
    (itemId: string, itemType: 'image' | 'video', e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (itemType === 'image') selectImage(itemId)
      else selectVideo(itemId)
      setContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        itemId,
        itemType,
      })
    },
    [selectImage, selectVideo, setContextMenu]
  )

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      const topFirst = [...sortedPreviewLayers].reverse()
      for (let i = 0; i < topFirst.length; i++) {
        const layer = topFirst[i]
        if (layer.kind === 'video') {
          const vid = layer.video
          const kf = resolveMediaKeyframeTransform(vid, playbackTime - vid.timestamp, manifestVideoTimelineSpanSeconds(vid))
          const vx = kf.x * xScale + offsetX
          const vy = kf.y * yScale + offsetY
          const vw = kf.width * xScale
          const vh = kf.height * yScale
          if (px >= vx && px <= vx + vw && py >= vy && py <= vy + vh) {
            e.preventDefault()
            e.stopPropagation()
            selectVideo(vid.id)
            setContextMenu({
              isOpen: true,
              x: e.clientX,
              y: e.clientY,
              itemId: vid.id,
              itemType: 'video',
            })
            return
          }
        } else if (layer.kind === 'image') {
          const img = layer.image
          const kf = resolveMediaKeyframeTransform(img, playbackTime - img.startTime, img.duration)
          const ix = kf.x * xScale + offsetX
          const iy = kf.y * yScale + offsetY
          const iw = kf.width * xScale
          const ih = kf.height * yScale
          if (px >= ix && px <= ix + iw && py >= iy && py <= iy + ih) {
            e.preventDefault()
            e.stopPropagation()
            selectImage(img.id)
            setContextMenu({
              isOpen: true,
              x: e.clientX,
              y: e.clientY,
              itemId: img.id,
              itemType: 'image',
            })
            return
          }
        }
      }

      const mainVideo = videos.find(
        (v) =>
          v.row === 0 &&
          playbackTime >= v.timestamp &&
          playbackTime < v.timestamp + manifestVideoTimelineSpanSeconds(v)
      )
      if (mainVideo) {
        if (px >= offsetX && px <= offsetX + contentRect.width && py >= offsetY && py <= offsetY + contentRect.height) {
          e.preventDefault()
          e.stopPropagation()
          selectVideo(mainVideo.id)
          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            itemId: mainVideo.id,
            itemType: 'video',
          })
        }
      }
    },
    [
      videos,
      sortedPreviewLayers,
      playbackTime,
      xScale,
      yScale,
      offsetX,
      offsetY,
      contentRect,
      selectImage,
      selectVideo,
      setContextMenu,
    ]
  )

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
        <div ref={containerRef} className={styles.videoContainer}>
          <div className={styles.previewLcpShell} aria-hidden />
          <div className={styles.canvasWrapper}>
            <canvas
              ref={canvasRef}
              className={styles.video}
              onClick={() => { setSelectedImageId(null); setSelectedVideoId(null); setSelectedTextId(null); setEditingTextId(null); if (cropEditId) exitCropEdit() }}
              onContextMenu={handleCanvasContextMenu}
              onDoubleClick={handleCanvasDoubleClick}
            />
            {hasMainContent && (
              <>
                <div className={styles.overlayLayer}>
                  {sortedPreviewLayers.map((layer) => {
                    if (layer.kind === 'image') {
                      const image = layer.image
                      const kf = resolveMediaKeyframeTransform(image, playbackTime - image.startTime, image.duration)
                      return (
                        <OverlayItem
                          key={image.id}
                          itemId={image.id}
                          itemType="image"
                          x={kf.x}
                          y={kf.y}
                          w={kf.width}
                          h={kf.height}
                          rotation={image.rotation ?? 0}
                          flipHorizontal={image.flipHorizontal}
                          flipVertical={image.flipVertical}
                          isSelected={selectedImageId === image.id}
                          offsetX={offsetX}
                          offsetY={offsetY}
                          xScale={xScale}
                          yScale={yScale}
                          handleOverlayMouseDown={handleOverlayMouseDown}
                          handleOverlayContextMenu={handleOverlayContextMenu}
                          handleImageRotationMouseDown={handleImageRotationMouseDown}
                          showRotateHandle={selectedImageId === image.id && !cropEditId}
                          hasCrop={!!image.cropAspect}
                          cropEditId={cropEditId}
                          enterCropEdit={enterCropEdit}
                          exitCropEdit={exitCropEdit}
                        />
                      )
                    }
                    if (layer.kind === 'video') {
                      const video = layer.video
                      const kf = resolveMediaKeyframeTransform(video, playbackTime - video.timestamp, manifestVideoTimelineSpanSeconds(video))
                      return (
                        <OverlayItem
                          key={video.id}
                          itemId={video.id}
                          itemType="video"
                          x={kf.x}
                          y={kf.y}
                          w={kf.width}
                          h={kf.height}
                          rotation={0}
                          flipHorizontal={video.flipHorizontal}
                          flipVertical={video.flipVertical}
                          isSelected={selectedVideoId === video.id}
                          offsetX={offsetX}
                          offsetY={offsetY}
                          xScale={xScale}
                          yScale={yScale}
                          handleOverlayMouseDown={handleOverlayMouseDown}
                          handleOverlayContextMenu={handleOverlayContextMenu}
                          showRotateHandle={false}
                          hasCrop={!!video.cropAspect}
                          cropEditId={cropEditId}
                          enterCropEdit={enterCropEdit}
                          exitCropEdit={exitCropEdit}
                        />
                      )
                    }
                    const text = layer.text
                    return (
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
                        playbackTime={playbackTime}
                        textRefs={textRefs}
                        getMeasureCtx={getMeasureCtx}
                      />
                    )
                  })}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
