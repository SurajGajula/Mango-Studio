'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { wrapTextToLines } from '@/app/lib/textUtils'
import { computeMediaCropForAspect, ASPECT_RATIOS } from '@/app/lib/mediaUtils'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import gsap from 'gsap'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useVideoPlayback } from '@/app/lib/useVideoPlayback'
import styles from './PreviewArea.module.css'
import TextOverlay from './TextOverlay'
import CropEditor from './CropEditor'

type DragMode = 'move' | null

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

interface TextResizeState {
  textId: string
  side: 'left' | 'right'
  startX: number
  initialX: number
  initialWidth: number
  minWidth: number
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
  const [textResizeState, setTextResizeState] = useState<TextResizeState | null>(null)
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const editingContentRef = useRef('')
  const [cropEditId, setCropEditId] = useState<string | null>(null)
  const [cropPanState, setCropPanState] = useState<CropPanState | null>(null)
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

  const activeImages = images.filter(
    (image) => !image.isMainTrack && playbackTime >= image.startTime && playbackTime < image.endTime
  )

  const activeOverlayVideos = videos.filter(
    (v) => v.isOverlay && playbackTime >= v.timestamp && playbackTime < v.timestamp + (v.duration ?? 0)
  )

  const activeTexts = texts.filter(
    (t) => playbackTime >= t.startTime && playbackTime < t.endTime
  )

  const logicalW = aspectRatio === '16:9' ? 1920 : 1080
  const logicalH = aspectRatio === '16:9' ? 1080 : 1920
  const xScale = contentRect.width > 0 ? contentRect.width / logicalW : 1
  const yScale = contentRect.height > 0 ? contentRect.height / logicalH : 1
  const offsetX = contentRect.x
  const offsetY = contentRect.y
  const yScaleRef = useRef(yScale)
  yScaleRef.current = yScale

  const enterCropEdit = useCallback(async (id: string, type: 'image' | 'video') => {
    if (type === 'image') {
      let img = images.find((i) => i.id === id)
      if (!img) return
      if (!img.cropAspect) {
        const currentAspect = img.width / img.height
        const matchingLabel = Object.keys(ASPECT_RATIOS).find(label => {
          const [rw, rh] = ASPECT_RATIOS[label]
          return Math.abs(currentAspect - (rw / rh)) < 0.01
        })
        const finalLabel = matchingLabel || aspectRatio
        const [rw, rh] = ASPECT_RATIOS[finalLabel]
        const updates = await computeMediaCropForAspect(img.url, 'image', aspectRatio, rw, rh, finalLabel)
        updateImage(id, updates as Partial<ImageClass>)
      }
      setCropEditId(id)
    } else {
      let vid = videos.find((v) => v.id === id)
      if (!vid) return
      if (!vid.cropAspect) {
        const currentAspect = vid.width / vid.height
        const matchingLabel = Object.keys(ASPECT_RATIOS).find(label => {
          const [rw, rh] = ASPECT_RATIOS[label]
          return Math.abs(currentAspect - (rw / rh)) < 0.01
        })
        const finalLabel = matchingLabel || aspectRatio
        const [rw, rh] = ASPECT_RATIOS[finalLabel]
        const updates = await computeMediaCropForAspect(vid.url || '', 'video', aspectRatio, rw, rh, finalLabel)
        updateVideo(id, updates as Partial<VideoClass>)
      }
      setCropEditId(id)
    }
  }, [images, videos, aspectRatio, updateImage, updateVideo])

  const exitCropEdit = useCallback(() => {
    setCropEditId(null)
    setCropPanState(null)
    pushHistory()
  }, [pushHistory])

  const handleCropPanStart = useCallback((e: React.MouseEvent) => {
    if (!cropEditId) return
    e.preventDefault()
    
    const img = images.find((i) => i.id === cropEditId)
    const vid = videos.find((v) => v.id === cropEditId)
    const item = img || vid
    if (!item) return

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (canvasRect) {
      const px = e.clientX - canvasRect.left
      const py = e.clientY - canvasRect.top
      const destX = item.x * xScale + offsetX
      const destY = item.y * yScale + offsetY
      const destW = item.width * xScale
      const destH = item.height * yScale
      if (px < destX || px > destX + destW || py < destY || py > destY + destH) {
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
  }, [cropEditId, images, videos, xScale, yScale, offsetX, offsetY, exitCropEdit])

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

      const logicalW = aspectRatio === '16:9' ? 1920 : 1080
      const logicalH = aspectRatio === '16:9' ? 1080 : 1920
      const snapTargetsX = [0, logicalW / 2, logicalW]
      const snapTargetsY = [0, logicalH / 2, logicalH]

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
      const item = useManifestStore.getState().images.find(i => i.id === imgId) ||
                   useManifestStore.getState().videos.find(v => v.id === imgId)
      if (!item) return
      
      const updates = {
        cropSx: Math.max(0, Math.min(1 - cropSw, startCropSx - dx * cropSw / destW)),
        cropSy: Math.max(0, Math.min(1 - cropSh, startCropSy - dy * cropSh / destH)),
      }
      if (useManifestStore.getState().images.some(i => i.id === imgId)) {
        updateImage(imgId, updates)
      } else {
        updateVideo(imgId, updates)
      }
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
      const { images: imgs, videos: vids, updateImage: updateImg, updateVideo: updateVid } = useManifestStore.getState()
      const item = imgs.find((i) => i.id === cropEditId) || vids.find((v) => v.id === cropEditId)
      if (!item) return
      const factor = Math.exp(e.deltaY * 0.002)
      const newCropSw = Math.min(1, Math.max(0.05, item.cropSw * factor))
      const newCropSh = Math.min(1, Math.max(0.05, item.cropSh * factor))
      const centerSx = item.cropSx + item.cropSw / 2
      const centerSy = item.cropSy + item.cropSh / 2
      const updates = {
        cropSw: newCropSw,
        cropSh: newCropSh,
        cropSx: Math.max(0, Math.min(1 - newCropSw, centerSx - newCropSw / 2)),
        cropSy: Math.max(0, Math.min(1 - newCropSh, centerSy - newCropSh / 2)),
      }
      if (imgs.some(i => i.id === cropEditId)) {
        updateImage(item.id, updates)
      } else {
        updateVideo(item.id, updates)
      }
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

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const snapTargetsX = [0, logicalW / 2, logicalW]
    const snapTargetsY = [0, logicalH / 2, logicalH]

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

  const handleTextResizeStart = useCallback((textId: string, side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const text = texts.find((t) => t.id === textId)
    if (!text) return
    const mCtx = getMeasureCtx()
    mCtx.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`
    const minWidth = mCtx.measureText('W').width
    setTextResizeState({ textId, side, startX: e.clientX, initialX: text.x, initialWidth: text.width, minWidth })
  }, [texts, getMeasureCtx])

  useEffect(() => {
    if (!textResizeState) return

    const handleMouseMove = (e: MouseEvent) => {
      if (xScale === 0) return
      const deltaX = (e.clientX - textResizeState.startX) / xScale
      const { minWidth } = textResizeState
      if (textResizeState.side === 'right') {
        updateText(textResizeState.textId, { width: Math.max(minWidth, textResizeState.initialWidth + deltaX) })
      } else {
        const newWidth = Math.max(minWidth, textResizeState.initialWidth - deltaX)
        const newX = textResizeState.initialX + (textResizeState.initialWidth - newWidth)
        updateText(textResizeState.textId, { width: newWidth, x: newX })
      }
    }

    const handleMouseUp = () => {
      setTextResizeState(null)
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [textResizeState, xScale, updateText, pushHistory])

  useEffect(() => {
    if ((!selectedImageId && !selectedVideoId) || cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
      
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.002)
      
      if (selectedImageId) {
        const img = images.find(i => i.id === selectedImageId)
        if (!img || img.isMainTrack) return
        const newWidth = Math.max(50, img.width * factor)
        const newHeight = img.height * (newWidth / img.width)
        const centerX = img.x + img.width / 2
        const centerY = img.y + img.height / 2
        updateImage(selectedImageId, {
          width: newWidth,
          height: newHeight,
          x: centerX - newWidth / 2,
          y: centerY - newHeight / 2
        })
      } else if (selectedVideoId) {
        const vid = videos.find(v => v.id === selectedVideoId)
        if (!vid || !vid.isOverlay) return
        const newWidth = Math.max(50, vid.width * factor)
        const newHeight = vid.height * (newWidth / vid.width)
        const centerX = vid.x + vid.width / 2
        const centerY = vid.y + vid.height / 2
        updateVideo(selectedVideoId, {
          width: newWidth,
          height: newHeight,
          x: centerX - newWidth / 2,
          y: centerY - newHeight / 2
        })
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [selectedImageId, selectedVideoId, images, videos, updateImage, updateVideo, cropEditId])

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
                      ? () => { if (cropEditId === image.id) exitCropEdit(); else enterCropEdit(image.id, 'image') }
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
