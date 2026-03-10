'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { wrapTextToLines } from '@/app/lib/textUtils'
import gsap from 'gsap'
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

interface TextDragState {
  textId: string
  startX: number
  startY: number
  initialX: number
  initialY: number
  initialWidth: number
  initialHeight: number
}

interface CropPanState {
  startX: number
  startY: number
  startCropSx: number
  startCropSy: number
  cropSw: number
  cropSh: number
  destW: number
  destH: number
}

export default function PreviewArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [dragState, setDragState] = useState<OverlayDragState | null>(null)
  const [textDragState, setTextDragState] = useState<TextDragState | null>(null)
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const editingContentRef = useRef('')
  const [cropEditId, setCropEditId] = useState<string | null>(null)
  const [cropPanState, setCropPanState] = useState<CropPanState | null>(null)
  const textRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const textTimelines = useRef<Map<string, gsap.core.Timeline>>(new Map())
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

  const activeImages = images.filter(
    (image) => !image.isMainTrack && playbackTime >= image.startTime && playbackTime < image.endTime
  )

  const activeOverlayVideos = videos.filter(
    (v) => v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0)
  )

  const activeTexts = texts.filter(
    (t) => playbackTime >= t.startTime && playbackTime < t.endTime
  )

  const xScale = contentRect.width > 0 ? contentRect.width / 1920 : 1
  const yScale = contentRect.height > 0 ? contentRect.height / 1080 : 1
  const offsetX = contentRect.x
  const offsetY = contentRect.y
  const yScaleRef = useRef(yScale)
  yScaleRef.current = yScale

  const enterCropEdit = useCallback((imageId: string) => {
    const img = images.find((i) => i.id === imageId)
    if (!img?.cropAspect) return
    setCropEditId(imageId)
  }, [images])

  const exitCropEdit = useCallback(() => {
    setCropEditId(null)
    setCropPanState(null)
    pushHistory()
  }, [pushHistory])


  const handleCropPanStart = useCallback((e: React.MouseEvent) => {
    if (!cropEditId) return
    e.preventDefault()
    const img = images.find((i) => i.id === cropEditId)
    if (!img) return

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (canvasRect) {
      const px = e.clientX - canvasRect.left
      const py = e.clientY - canvasRect.top
      const destX = img.x * xScale + offsetX
      const destY = img.y * yScale + offsetY
      const destW = img.width * xScale
      const destH = img.height * yScale
      if (px < destX || px > destX + destW || py < destY || py > destY + destH) {
        exitCropEdit()
        return
      }
    }

    setCropPanState({
      startX: e.clientX,
      startY: e.clientY,
      startCropSx: img.cropSx,
      startCropSy: img.cropSy,
      cropSw: img.cropSw,
      cropSh: img.cropSh,
      destW: img.width * xScale,
      destH: img.height * yScale,
    })
  }, [cropEditId, images, xScale, yScale, offsetX, offsetY, exitCropEdit])

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const visibleImages = images.filter(
      (img) => img.cropAspect && playbackTime >= img.startTime && playbackTime < img.endTime
    )
    for (const img of visibleImages) {
      const ix = img.x * xScale + offsetX
      const iy = img.y * yScale + offsetY
      const iw = img.width * xScale
      const ih = img.height * yScale
      if (px >= ix && px <= ix + iw && py >= iy && py <= iy + ih) {
        enterCropEdit(img.id)
        return
      }
    }
  }, [images, playbackTime, xScale, yScale, offsetX, offsetY, enterCropEdit])

  const applyUpdate = useCallback((itemId: string, itemType: 'image' | 'video', updates: { x?: number; y?: number; width?: number; height?: number }) => {
    if (itemType === 'image') updateImage(itemId, updates)
    else updateVideo(itemId, updates)
  }, [updateImage, updateVideo])

  const handleOverlayMouseDown = useCallback((itemId: string, itemType: 'image' | 'video', mode: DragMode, e: React.MouseEvent) => {
    if (cropEditId) return
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

  useEffect(() => {
    if (!cropPanState) return
    const imgId = cropEditId
    const { startX, startY, startCropSx, startCropSy, cropSw, cropSh, destW, destH } = cropPanState

    const handleMouseMove = (e: MouseEvent) => {
      if (!imgId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      updateImage(imgId, {
        cropSx: Math.max(0, Math.min(1 - cropSw, startCropSx - dx * cropSw / destW)),
        cropSy: Math.max(0, Math.min(1 - cropSh, startCropSy - dy * cropSh / destH)),
      })
    }

    const handleMouseUp = () => setCropPanState(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [cropPanState, cropEditId, updateImage])

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

  useEffect(() => {
    if (!cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
      e.preventDefault()
      const { images: imgs, updateImage: update } = useManifestStore.getState()
      const img = imgs.find((i) => i.id === cropEditId)
      if (!img) return
      const factor = Math.exp(e.deltaY * 0.002)
      const newCropSw = Math.min(1, Math.max(0.05, img.cropSw * factor))
      const newCropSh = Math.min(1, Math.max(0.05, img.cropSh * factor))
      const centerSx = img.cropSx + img.cropSw / 2
      const centerSy = img.cropSy + img.cropSh / 2
      updateImage(img.id, {
        cropSw: newCropSw,
        cropSh: newCropSh,
        cropSx: Math.max(0, Math.min(1 - newCropSw, centerSx - newCropSw / 2)),
        cropSy: Math.max(0, Math.min(1 - newCropSh, centerSy - newCropSh / 2)),
      })
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [cropEditId])

  useEffect(() => {
    if (!selectedTextId || cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
      e.preventDefault()
      const { texts: currentTexts, updateText: update } = useManifestStore.getState()
      const text = currentTexts.find((t) => t.id === selectedTextId)
      if (!text) return
      const factor = Math.exp(-e.deltaY * 0.004)
      const newFontSize = Math.max(8, Math.min(400, text.fontSize * factor))
      const actualFactor = newFontSize / text.fontSize
      const newWidth = text.width * actualFactor
      const centerX = text.x + text.width / 2
      const el = textRefs.current.get(selectedTextId)
      const ys = yScaleRef.current
      const renderedLogicalHeight = el && ys > 0 ? el.getBoundingClientRect().height / ys : text.height
      const centerY = text.y + renderedLogicalHeight / 2
      const estimatedNewHeight = renderedLogicalHeight * actualFactor
      update(selectedTextId, {
        fontSize: newFontSize,
        width: newWidth,
        x: centerX - newWidth / 2,
        y: centerY - estimatedNewHeight / 2,
      })
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [selectedTextId, cropEditId])

  const textAnimKey = texts.map((t) => `${t.id}:${t.startTime}:${t.endTime}:${t.opacity}`).join('|')

  useEffect(() => {
    const existingIds = new Set(textTimelines.current.keys())
    const currentIds = new Set(texts.map((t) => t.id))

    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        textTimelines.current.get(id)?.kill()
        textTimelines.current.delete(id)
      }
    }

    for (const text of texts) {
      const el = textRefs.current.get(text.id)
      if (!el) continue
      gsap.set(el, { opacity: text.opacity })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textAnimKey])

  const handleTextMouseDown = useCallback((textId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const isSelected = selectedTextId === textId
    if (!isSelected) {
      setSelectedTextId(textId)
      setSelectedVideoId(null)
      setSelectedImageId(null)
      return
    }

    const text = texts.find((t) => t.id === textId)
    if (!text) return

    const el = textRefs.current.get(textId)
    const ys = yScaleRef.current
    const actualHeight = el && ys > 0 ? el.getBoundingClientRect().height / ys : text.height
    setTextDragState({ textId, startX: e.clientX, startY: e.clientY, initialX: text.x, initialY: text.y, initialWidth: text.width, initialHeight: actualHeight })
  }, [selectedTextId, texts, setSelectedTextId, setSelectedVideoId, setSelectedImageId])

  useEffect(() => {
    if (!textDragState) {
      setSnapLines({ horizontal: [], vertical: [] })
      return
    }

    const snapTargetsX = [0, 960, 1920]
    const snapTargetsY = [0, 540, 1080]

    const handleMouseMove = (e: MouseEvent) => {
      if (xScale === 0 || yScale === 0) return
      const deltaX = (e.clientX - textDragState.startX) / xScale
      const deltaY = (e.clientY - textDragState.startY) / yScale

      let newX = textDragState.initialX + deltaX
      let newY = textDragState.initialY + deltaY
      const width = textDragState.initialWidth
      const height = textDragState.initialHeight

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
      updateText(textDragState.textId, { x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setTextDragState(null)
      setSnapLines({ horizontal: [], vertical: [] })
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [textDragState, xScale, yScale, updateText, pushHistory])

  const renderOverlayItem = (
    itemId: string,
    itemType: 'image' | 'video',
    x: number, y: number, w: number, h: number,
    isSelected: boolean,
    children: React.ReactNode,
    onDoubleClick?: () => void
  ) => {
    const px = offsetX + x * xScale
    const py = offsetY + y * yScale
    const pw = w * xScale
    const ph = h * yScale

    return (
      <div
        key={itemId}
        className={`${styles.imageOverlay} ${isSelected ? styles.selected : ''}`}
        style={{ left: px, top: py, width: pw, height: ph }}
        onMouseDown={(e) => handleOverlayMouseDown(itemId, itemType, 'move', e)}
        onDoubleClick={onDoubleClick}
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
                onClick={() => { setSelectedImageId(null); setSelectedVideoId(null); setSelectedTextId(null); setEditingTextId(null); if (cropEditId) exitCropEdit() }}
                onDoubleClick={handleCanvasDoubleClick}
              />
              <div className={styles.overlayLayer}>
                {activeImages.map((image) =>
                  renderOverlayItem(
                    image.id, 'image',
                    image.x, image.y, image.width, image.height,
                    selectedImageId === image.id,
                    null,
                    image.cropAspect
                      ? () => { if (cropEditId === image.id) exitCropEdit(); else enterCropEdit(image.id) }
                      : undefined
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
                {activeTexts.map((text) => {
                  const isSelected = selectedTextId === text.id
                  const isEditing = editingTextId === text.id
                  return (
                    <div
                      key={text.id}
                      ref={(el) => { textRefs.current.set(text.id, el) }}
                      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
                      style={{
                        left: offsetX + text.x * xScale,
                        top: offsetY + text.y * yScale,
                        width: text.width * xScale,
                        fontSize: text.fontSize * xScale,
                        color: text.color,
                        fontWeight: text.fontWeight,
                        textAlign: text.textAlign as React.CSSProperties['textAlign'],
                        fontFamily: text.fontFamily,
                      }}
                      onMouseDown={(e) => handleTextMouseDown(text.id, e)}
                      onDoubleClick={(e) => { e.stopPropagation(); editingContentRef.current = text.content; setEditingContent(text.content); setEditingTextId(text.id) }}
                    >
                      {isEditing ? (
                        <textarea
                          value={editingContent}
                          className={styles.textEditArea}
                          onChange={(e) => { editingContentRef.current = e.target.value; setEditingContent(e.target.value) }}
                          ref={(el) => {
                            if (el) {
                              setTimeout(() => {
                                el.focus()
                                const len = el.value.length
                                el.setSelectionRange(len, len)
                              }, 0)
                            }
                          }}
                          onBlur={() => {
                            updateText(text.id, { content: editingContentRef.current })
                            pushHistory()
                            setEditingTextId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setEditingTextId(null) }
                            e.stopPropagation()
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (() => {
                        const mCtx = getMeasureCtx()
                        mCtx.font = `${text.fontWeight} ${text.fontSize * xScale}px ${text.fontFamily}`
                        const lines = wrapTextToLines(mCtx, text.content || 'Text', text.width * xScale)
                        return lines.join('\n')
                      })()}
                    </div>
                  )
                })}
                {snapLines.vertical.map((x, i) => (
                  <div key={`v-${i}`} className={styles.snapLineVertical} style={{ left: offsetX + x * xScale }} />
                ))}
                {snapLines.horizontal.map((y, i) => (
                  <div key={`h-${i}`} className={styles.snapLineHorizontal} style={{ top: offsetY + y * yScale }} />
                ))}
              </div>
              {cropEditId && (() => {
                const img = images.find((i) => i.id === cropEditId)
                if (!img) return null

                const destX = img.x * xScale + offsetX
                const destY = img.y * yScale + offsetY
                const destW = img.width * xScale
                const destH = img.height * yScale

                const fullImgW = destW / img.cropSw
                const fullImgH = destH / img.cropSh
                const fullImgLeft = destX - img.cropSx * fullImgW
                const fullImgTop = destY - img.cropSy * fullImgH

                const clipLeft = offsetX
                const clipTop = offsetY
                const clipW = contentRect.width
                const clipH = contentRect.height

                const cropBoxLeft = destX - clipLeft
                const cropBoxTop = destY - clipTop

                return (
                  <>
                    <div style={{ position: 'absolute', left: clipLeft, top: clipTop, width: clipW, height: clipH, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
                      <img
                        src={img.url}
                        style={{ position: 'absolute', left: fullImgLeft - clipLeft, top: fullImgTop - clipTop, width: fullImgW, height: fullImgH, userSelect: 'none' }}
                        draggable={false}
                      />
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cropBoxTop, background: 'rgba(0,0,0,0.55)' }} />
                      <div style={{ position: 'absolute', left: 0, right: 0, top: cropBoxTop + destH, bottom: 0, background: 'rgba(0,0,0,0.55)' }} />
                      <div style={{ position: 'absolute', top: cropBoxTop, left: 0, width: cropBoxLeft, height: destH, background: 'rgba(0,0,0,0.55)' }} />
                      <div style={{ position: 'absolute', top: cropBoxTop, left: cropBoxLeft + destW, right: 0, height: destH, background: 'rgba(0,0,0,0.55)' }} />
                    </div>
                    <div style={{ position: 'absolute', left: destX, top: destY, width: destW, height: destH, border: '1.5px solid rgba(255,255,255,0.85)', outline: '1px solid rgba(0,0,0,0.4)', pointerEvents: 'none', zIndex: 11 }} />
                    <div
                      style={{ position: 'absolute', left: clipLeft, top: clipTop, width: clipW, height: clipH, cursor: cropPanState ? 'grabbing' : 'grab', zIndex: 60 }}
                      onMouseDown={handleCropPanStart}
                      onDoubleClick={exitCropEdit}
                    />
                  </>
                )
              })()}
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
