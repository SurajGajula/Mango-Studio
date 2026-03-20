import { useState, useCallback, useRef, useEffect } from 'react'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { TextClass } from '@/app/models/TextClass'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'

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

const SNAP_THRESHOLD = 10

export function usePreviewInteractions(
  aspectRatio: '16:9' | '9:16',
  xScale: number,
  yScale: number,
  offsetX: number,
  offsetY: number,
  images: ImageClass[],
  videos: VideoClass[],
  texts: TextClass[],
  updateImage: (id: string, updates: Partial<ImageClass>) => void,
  updateVideo: (id: string, updates: Partial<VideoClass>) => void,
  updateText: (id: string, updates: Partial<TextClass>) => void,
  pushHistory: () => void,
  selectedImageId: string | null,
  setSelectedImageId: (id: string | null) => void,
  selectedVideoId: string | null,
  setSelectedVideoId: (id: string | null) => void,
  selectedTextId: string | null,
  setSelectedTextId: (id: string | null) => void,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  textRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>,
  getMeasureCtx: () => CanvasRenderingContext2D
) {
  const [dragState, setDragState] = useState<OverlayDragState | null>(null)
  const [textDragState, setTextDragState] = useState<TextDragState | null>(null)
  const [textResizeState, setTextResizeState] = useState<TextResizeState | null>(null)
  const [snapLines, setSnapLines] = useState<{ horizontal: number[], vertical: number[] }>({ horizontal: [], vertical: [] })
  const [cropEditId, setCropEditId] = useState<string | null>(null)
  const [cropPanState, setCropPanState] = useState<CropPanState | null>(null)
  const yScaleRef = useRef(yScale)
  yScaleRef.current = yScale

  const enterCropEdit = useCallback(async (id: string, type: 'image' | 'video') => {
    if (type === 'image') {
      let img = images.find((i) => i.id === id)
      if (!img) return
      
      const isMainTrack = (img as any).row === 0
      if (!img.cropAspect) {
        // Force the current project aspect ratio if it's the main track and no crop is set
        const [rw, rh] = isMainTrack ? ASPECT_RATIOS[aspectRatio] : [img.width, img.height]
        const label = isMainTrack ? aspectRatio : 'Original'
        const updates = await computeMediaCropForAspect(img.url, 'image', aspectRatio, rw, rh, label)
        updateImage(id, updates as Partial<ImageClass>)
      }
      setCropEditId(id)
    } else {
      let vid = videos.find((v) => v.id === id)
      if (!vid) return
      
      const isMainTrack = (vid as any).row === 0
      if (!vid.cropAspect) {
        const [rw, rh] = isMainTrack ? ASPECT_RATIOS[aspectRatio] : [vid.width, vid.height]
        const label = isMainTrack ? aspectRatio : 'Original'
        const updates = await computeMediaCropForAspect(vid.url || '', 'video', aspectRatio, rw, rh, label)
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
  }, [images, videos, selectedImageId, selectedVideoId, setSelectedImageId, setSelectedVideoId, cropEditId])

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
        if (dragState.itemType === 'image') updateImage(dragState.itemId, { x: newX, y: newY })
        else updateVideo(dragState.itemId, { x: newX, y: newY })
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
  }, [dragState, xScale, yScale, updateImage, updateVideo, pushHistory, aspectRatio])

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
  }, [selectedTextId, texts, setSelectedTextId, setSelectedVideoId, setSelectedImageId, textRefs])

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
  }, [textDragState, xScale, yScale, updateText, pushHistory, aspectRatio])

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
    if (!cropPanState) return
    const imgId = cropEditId
    const { startX, startY, startCropSx, startCropSy, cropSw, cropSh, destW, destH } = cropPanState

    const handleMouseMove = (e: MouseEvent) => {
      if (!imgId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      
      const safeStartSx = startCropSx ?? 0
      const safeStartSy = startCropSy ?? 0
      const safeCropSw = cropSw ?? 1
      const safeCropSh = cropSh ?? 1
      const safeDestW = destW || 1
      const safeDestH = destH || 1

      const updates = {
        cropSx: Math.max(0, Math.min(Math.max(0, 1 - safeCropSw), safeStartSx - dx * safeCropSw / safeDestW)),
        cropSy: Math.max(0, Math.min(Math.max(0, 1 - safeCropSh), safeStartSy - dy * safeCropSh / safeDestH)),
      }
      
      const isImage = images.some(i => i.id === imgId)
      if (isImage) {
        updateImage(imgId, updates)
      } else {
        updateVideo(imgId, updates)
      }
    }

    const handleMouseUp = () => {
      setCropPanState(null)
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [cropPanState, cropEditId, updateImage, updateVideo, images, videos, pushHistory])

  useEffect(() => {
    if (!cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
      
      // Only zoom if a modifier key is pressed (Cmd, Ctrl, or Alt)
      // This prevents trackpad scrolls from being interpreted as zoom.
      // e.ctrlKey is also true for pinch-to-zoom on most trackpads.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) return

      e.preventDefault()
      const item = images.find((i) => i.id === cropEditId) || videos.find((v) => v.id === cropEditId)
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
      const isImage = images.some(i => i.id === cropEditId)
      if (isImage) {
        updateImage(item.id, updates)
      } else {
        updateVideo(item.id, updates)
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [cropEditId, images, videos, updateImage, updateVideo, canvasRef])

  useEffect(() => {
    if (!selectedTextId || cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
      e.preventDefault()
      const text = texts.find((t) => t.id === selectedTextId)
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
      updateText(selectedTextId, {
        fontSize: newFontSize,
        width: newWidth,
        x: centerX - newWidth / 2,
        y: centerY - estimatedNewHeight / 2,
      })
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [selectedTextId, cropEditId, texts, updateText, textRefs, canvasRef])

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
  }, [selectedImageId, selectedVideoId, images, videos, updateImage, updateVideo, cropEditId, canvasRef])

  return {
    snapLines,
    cropEditId,
    setCropEditId,
    cropPanState,
    setCropPanState,
    enterCropEdit,
    exitCropEdit,
    handleOverlayMouseDown,
    handleTextMouseDown,
    handleTextResizeStart
  }
}
