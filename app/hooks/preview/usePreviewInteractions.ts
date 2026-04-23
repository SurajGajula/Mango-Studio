import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { getEffectiveCropForEdit, patchCropForItemOrKeyframe } from '@/app/lib/cropKeyframeHelpers'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import { TextClass } from '@/app/models/TextClass'
import type { AspectRatio } from '@/app/stores/manifest/types'
import {
  ASPECT_RATIOS,
  clampCropZoomToFrameAspect,
  clampPlacementRectToLogicalCanvas,
  computeMediaCropForAspect,
  getLogicalCanvasDimensions,
  loadNaturalMediaSize,
  minUniformScaleToCoverLogicalCanvas,
  normalizeCropToFrameAspect,
  frameDimensionsForCropClamp,
} from '@/app/lib/mediaUtils'

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

interface ImageRotateState {
  itemId: string
  centerClientX: number
  centerClientY: number
  startAngleRad: number
  initialRotation: number
}

const SNAP_THRESHOLD = 10

export function usePreviewInteractions(
  aspectRatio: AspectRatio,
  xScale: number,
  yScale: number,
  offsetX: number,
  offsetY: number,
  images: ImageClass[],
  videos: VideoClass[],
  texts: TextClass[],
  playbackTime: number,
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
  const [imageRotateState, setImageRotateState] = useState<ImageRotateState | null>(null)
  const [cropPanState, setCropPanState] = useState<CropPanState | null>(null)
  const [cropNaturalSize, setCropNaturalSize] = useState<{ nw: number; nh: number } | null>(null)
  const selectedKeyframeId = useSelectionStore((state) => state.selectedKeyframeId)
  const yScaleRef = useRef(yScale)
  yScaleRef.current = yScale

  const naturalSizeCacheRef = useRef<Map<string, { nw: number; nh: number }>>(new Map())
  const wheelResizeGenRef = useRef(0)
  const wheelItemHistoryActiveRef = useRef(false)
  const wheelItemFlushRafRef = useRef<number | null>(null)
  const wheelItemCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWheelItemResizeRef = useRef<
    | null
    | {
        kind: 'image'
        id: string
        url: string
        newW: number
        newH: number
        nextX: number
        nextY: number
        gen: number
      }
    | {
        kind: 'video'
        id: string
        url: string
        newW: number
        newH: number
        nextX: number
        nextY: number
        gen: number
      }
  >(null)

  useEffect(() => {
    if (cropEditId || !selectedImageId) return
    const img = images.find((i) => i.id === selectedImageId)
    const url = img?.url
    if (!url || naturalSizeCacheRef.current.has(url)) return
    void loadNaturalMediaSize(url, 'image')
      .then(({ nw, nh }) => {
        naturalSizeCacheRef.current.set(url, { nw, nh })
      })
      .catch(() => {})
  }, [selectedImageId, images, cropEditId])

  useEffect(() => {
    if (cropEditId || !selectedVideoId) return
    const vid = videos.find((v) => v.id === selectedVideoId)
    const url = vid?.url
    if (!url || naturalSizeCacheRef.current.has(url)) return
    void loadNaturalMediaSize(url, 'video')
      .then(({ nw, nh }) => {
        naturalSizeCacheRef.current.set(url, { nw, nh })
      })
      .catch(() => {})
  }, [selectedVideoId, videos, cropEditId])

  const cropTargetUrl = useMemo(() => {
    if (!cropEditId) return null
    const item = images.find((i) => i.id === cropEditId) || videos.find((v) => v.id === cropEditId)
    return item?.url ?? null
  }, [cropEditId, images, videos])

  useEffect(() => {
    if (!cropEditId || !cropTargetUrl) {
      setCropNaturalSize(null)
      return
    }
    let cancelled = false
    const isImage = useManifestStore.getState().images.some((i) => i.id === cropEditId)
    if (isImage) {
      const im = new Image()
      im.onload = () => {
        if (cancelled) return
        const nw = im.naturalWidth
        const nh = im.naturalHeight
        if (nw === 0 || nh === 0) return
        setCropNaturalSize({ nw, nh })
        const s = useManifestStore.getState()
        const cur = s.images.find((i) => i.id === cropEditId) || s.videos.find((v) => v.id === cropEditId)
        if (!cur) return
        const kfId = useSelectionStore.getState().selectedKeyframeId
        const pt = useManifestStore.getState().playbackTime
        const eff = getEffectiveCropForEdit(cur as ImageClass, kfId, pt)
        const { fw, fh } = frameDimensionsForCropClamp(cur, aspectRatio)
        const n = normalizeCropToFrameAspect(
          fw,
          fh,
          nw,
          nh,
          eff.cropSx,
          eff.cropSy,
          eff.cropSw,
          eff.cropSh,
          0.05
        )
        if (!n) return
        const changed =
          Math.abs(n.cropSw - eff.cropSw) > 1e-4 ||
          Math.abs(n.cropSh - eff.cropSh) > 1e-4 ||
          Math.abs(n.cropSx - eff.cropSx) > 1e-4 ||
          Math.abs(n.cropSy - eff.cropSy) > 1e-4
        if (!changed) return
        const patch = patchCropForItemOrKeyframe(cur as ImageClass, kfId, n, pt)
        if (s.images.some((i) => i.id === cropEditId)) s.updateImage(cropEditId, patch as Partial<ImageClass>)
        else s.updateVideo(cropEditId, patch as Partial<VideoClass>)
      }
      im.src = cropTargetUrl
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.playsInline = true
      v.onloadedmetadata = () => {
        if (cancelled) return
        const nw = v.videoWidth
        const nh = v.videoHeight
        if (nw === 0 || nh === 0) return
        setCropNaturalSize({ nw, nh })
        v.src = ''
        v.load()
        const s = useManifestStore.getState()
        const cur = s.images.find((i) => i.id === cropEditId) || s.videos.find((v) => v.id === cropEditId)
        if (!cur) return
        const kfId = useSelectionStore.getState().selectedKeyframeId
        const pt = useManifestStore.getState().playbackTime
        const eff = getEffectiveCropForEdit(cur as ImageClass, kfId, pt)
        const { fw, fh } = frameDimensionsForCropClamp(cur, aspectRatio)
        const n = normalizeCropToFrameAspect(
          fw,
          fh,
          nw,
          nh,
          eff.cropSx,
          eff.cropSy,
          eff.cropSw,
          eff.cropSh,
          0.05
        )
        if (!n) return
        const changed =
          Math.abs(n.cropSw - eff.cropSw) > 1e-4 ||
          Math.abs(n.cropSh - eff.cropSh) > 1e-4 ||
          Math.abs(n.cropSx - eff.cropSx) > 1e-4 ||
          Math.abs(n.cropSy - eff.cropSy) > 1e-4
        if (!changed) return
        const patch = patchCropForItemOrKeyframe(cur as ImageClass, kfId, n, pt)
        if (s.images.some((i) => i.id === cropEditId)) s.updateImage(cropEditId, patch as Partial<ImageClass>)
        else s.updateVideo(cropEditId, patch as Partial<VideoClass>)
      }
      v.src = cropTargetUrl
    }
    return () => {
      cancelled = true
    }
  }, [cropEditId, cropTargetUrl, aspectRatio, selectedKeyframeId, playbackTime])

  const enterCropEdit = useCallback(async (id: string, type: 'image' | 'video') => {
    let targetItem = type === 'image' ? images.find(i => i.id === id) : videos.find(v => v.id === id)
    if (!targetItem) return

    const isTimelineRow0 = targetItem.row === 0
    const allowCoverScaleForCropEdit =
      !targetItem.cropAspect || targetItem.cropAspect === aspectRatio
    if (isTimelineRow0 && allowCoverScaleForCropEdit) {
      const coverS = minUniformScaleToCoverLogicalCanvas(
        targetItem.width,
        targetItem.height,
        aspectRatio
      )
      if (coverS > 1) {
        const w = targetItem.width * coverS
        const h = targetItem.height * coverS
        const cx = targetItem.x + targetItem.width / 2
        const cy = targetItem.y + targetItem.height / 2
        const patch = { width: w, height: h, x: cx - w / 2, y: cy - h / 2 }
        if (type === 'image') updateImage(id, patch)
        else updateVideo(id, patch)
        const st = useManifestStore.getState()
        const next =
          type === 'image' ? st.images.find((i) => i.id === id) : st.videos.find((v) => v.id === id)
        if (next) targetItem = next
      }
    }

    if (!targetItem.cropAspect) {
      const [rw, rh] = [targetItem.width, targetItem.height]
      const [cw, ch] = ASPECT_RATIOS[aspectRatio]
      const matchesCanvas =
        targetItem.width > 0 &&
        targetItem.height > 0 &&
        Math.abs(targetItem.width / targetItem.height - cw / ch) < 1e-6
      const label = isTimelineRow0 && matchesCanvas ? aspectRatio : 'Original'
      const updates = await computeMediaCropForAspect(targetItem.url || '', type, aspectRatio, rw, rh, label)
      if (type === 'image') updateImage(id, updates as Partial<ImageClass>)
      else updateVideo(id, updates as Partial<VideoClass>)
    }
    
    // Use a small delay or requestAnimationFrame to ensure the store update has propagated
    // so handleCropPanStart sees the new crop values
    requestAnimationFrame(() => {
      setCropEditId(id)
    })
  }, [images, videos, aspectRatio, updateImage, updateVideo])

  const exitCropEdit = useCallback(() => {
    setCropEditId(null)
    setCropPanState(null)
    pushHistory()
  }, [pushHistory])

  const handleImageRotationMouseDown = useCallback((itemId: string, e: React.MouseEvent) => {
    if (cropEditId) return
    e.preventDefault()
    e.stopPropagation()
    const img = images.find((i) => i.id === itemId)
    if (!img) return
    if (selectedImageId !== itemId) {
      setSelectedImageId(itemId)
      setSelectedVideoId(null)
      setSelectedTextId(null)
    }
    const cx = offsetX + (img.x + img.width / 2) * xScale
    const cy = offsetY + (img.y + img.height / 2) * yScale
    setImageRotateState({
      itemId,
      centerClientX: cx,
      centerClientY: cy,
      startAngleRad: Math.atan2(e.clientY - cy, e.clientX - cx),
      initialRotation: img.rotation ?? 0,
    })
  }, [
    cropEditId,
    images,
    offsetX,
    offsetY,
    xScale,
    yScale,
    selectedImageId,
    setSelectedImageId,
    setSelectedVideoId,
    setSelectedTextId,
  ])

  useEffect(() => {
    if (!imageRotateState) return

    useManifestStore.getState().pauseHistory()

    const handleMouseMove = (e: MouseEvent) => {
      const { itemId, centerClientX, centerClientY, startAngleRad, initialRotation } = imageRotateState
      const angle = Math.atan2(e.clientY - centerClientY, e.clientX - centerClientX)
      const deltaDeg = ((angle - startAngleRad) * 180) / Math.PI
      updateImage(itemId, { rotation: initialRotation + deltaDeg })
    }

    const handleMouseUp = () => {
      useManifestStore.getState().resumeHistory()
      setImageRotateState(null)
      pushHistory()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      useManifestStore.getState().resumeHistory()
    }
  }, [imageRotateState, updateImage, pushHistory])

  const handleOverlayMouseDown = useCallback((itemId: string, itemType: 'image' | 'video', mode: DragMode, e: React.MouseEvent) => {
    if (cropEditId) return
    e.preventDefault()
    e.stopPropagation()

    const isSelectedItem = itemType === 'image' ? selectedImageId === itemId : selectedVideoId === itemId
    if (!isSelectedItem) {
      if (itemType === 'image') {
        setSelectedImageId(itemId)
        setSelectedVideoId(null)
      } else {
        setSelectedVideoId(itemId)
        setSelectedImageId(null)
      }
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

      const { logicalW, logicalH } = getLogicalCanvasDimensions(aspectRatio)
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

        const maxX = Math.max(0, logicalW - width)
        const maxY = Math.max(0, logicalH - height)
        newX = Math.min(Math.max(0, newX), maxX)
        newY = Math.min(Math.max(0, newY), maxY)

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

    const { logicalW, logicalH } = getLogicalCanvasDimensions(aspectRatio)
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

      const maxX = Math.max(0, logicalW - width)
      const maxY = Math.max(0, logicalH - height)
      newX = Math.min(Math.max(0, newX), maxX)
      newY = Math.min(Math.max(0, newY), maxY)

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

  const imagesRef = useRef(images)
  const videosRef = useRef(videos)
  useEffect(() => {
    imagesRef.current = images
    videosRef.current = videos
  }, [images, videos])

  const isKeyboardPanningRef = useRef(false)

  useEffect(() => {
    if (!cropEditId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const step = e.shiftKey ? 0.05 : 0.01
      let dx = 0
      let dy = 0

      switch (e.key) {
        case 'ArrowLeft': dx = -step; break
        case 'ArrowRight': dx = step; break
        case 'ArrowUp': dy = -step; break
        case 'ArrowDown': dy = step; break
        default: return
      }

      e.preventDefault()
      
      if (!isKeyboardPanningRef.current) {
        useManifestStore.getState().pauseHistory()
        isKeyboardPanningRef.current = true
      }
      
      const state = useManifestStore.getState()
      const item = state.images.find(i => i.id === cropEditId) || state.videos.find(v => v.id === cropEditId)
      if (!item) return
      const kfId = useSelectionStore.getState().selectedKeyframeId
      const pt = useManifestStore.getState().playbackTime
      const eff = getEffectiveCropForEdit(item as ImageClass, kfId, pt)

      const updates = {
        cropSx: Math.max(0, Math.min(Math.max(0, 1 - eff.cropSw), eff.cropSx + dx)),
        cropSy: Math.max(0, Math.min(Math.max(0, 1 - eff.cropSh), eff.cropSy + dy))
      }

      const patch = patchCropForItemOrKeyframe(item as ImageClass, kfId, updates, pt)
      if (state.images.some(i => i.id === cropEditId)) {
        state.updateImage(cropEditId, patch as Partial<ImageClass>)
      } else {
        state.updateVideo(cropEditId, patch as Partial<VideoClass>)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (isKeyboardPanningRef.current) {
          useManifestStore.getState().resumeHistory()
          isKeyboardPanningRef.current = false
          pushHistory()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (isKeyboardPanningRef.current) {
        useManifestStore.getState().resumeHistory()
        isKeyboardPanningRef.current = false
      }
    }
  }, [cropEditId, pushHistory, selectedKeyframeId, playbackTime])

  useEffect(() => {
    if (!cropPanState || !cropEditId) return
    const imgId = cropEditId
    const { startX, startY, startCropSx, startCropSy, cropSw, cropSh, destW, destH } = cropPanState

    // Pause history during the drag to avoid flooding and improve performance
    useManifestStore.getState().pauseHistory()

    const handlePointerMove = (e: PointerEvent) => {
      // Ensure the left button is still pressed
      if (e.buttons !== 1) return

      e.preventDefault()
      e.stopPropagation()
      
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      
      const safeStartSx = startCropSx ?? 0
      const safeStartSy = startCropSy ?? 0
      const safeCropSw = cropSw ?? 1
      const safeCropSh = cropSh ?? 1
      const safeDestW = destW || 1
      const safeDestH = destH || 1

      const updates = {
        cropSx: Math.max(0, Math.min(Math.max(0, 1 - safeCropSw), safeStartSx - (dx * safeCropSw / safeDestW))),
        cropSy: Math.max(0, Math.min(Math.max(0, 1 - safeCropSh), safeStartSy - (dy * safeCropSh / safeDestH))),
      }
      
      const state = useManifestStore.getState()
      const item = state.images.find(i => i.id === imgId) || state.videos.find(v => v.id === imgId)
      if (!item) return
      const kfId = useSelectionStore.getState().selectedKeyframeId
      const pt = useManifestStore.getState().playbackTime
      const patch = patchCropForItemOrKeyframe(item as ImageClass, kfId, updates, pt)
      const isImage = state.images.some(i => i.id === imgId)
      if (isImage) {
        state.updateImage(imgId, patch as Partial<ImageClass>)
      } else {
        state.updateVideo(imgId, patch as Partial<VideoClass>)
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Resume and push history when the drag is complete
      useManifestStore.getState().resumeHistory()
      setCropPanState(null)
      pushHistory()
    }

    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('pointerup', handlePointerUp, { capture: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      window.removeEventListener('pointerup', handlePointerUp, { capture: true })
      // Make sure we resume history if the effect is cleaned up mid-drag
      useManifestStore.getState().resumeHistory()
    }
  }, [cropPanState, cropEditId, updateImage, updateVideo, pushHistory, selectedKeyframeId, playbackTime])

  useEffect(() => {
    if (!cropEditId) return
    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return

      e.preventDefault()
      const item = images.find((i) => i.id === cropEditId) || videos.find((v) => v.id === cropEditId)
      if (!item) return
      if (!cropNaturalSize) return
      const kfId = useSelectionStore.getState().selectedKeyframeId
      const pt = useManifestStore.getState().playbackTime
      const eff = getEffectiveCropForEdit(item as ImageClass, kfId, pt)
      const factor = Math.exp(e.deltaY * 0.002)
      const { fw, fh } = frameDimensionsForCropClamp(item, aspectRatio)
      const { cropSw: newCropSw, cropSh: newCropSh } = clampCropZoomToFrameAspect(
        fw,
        fh,
        cropNaturalSize.nw,
        cropNaturalSize.nh,
        eff.cropSw,
        eff.cropSh,
        factor,
        0.05
      )
      const centerSx = eff.cropSx + eff.cropSw / 2
      const centerSy = eff.cropSy + eff.cropSh / 2
      const updates = {
        cropSw: newCropSw,
        cropSh: newCropSh,
        cropSx: Math.max(0, Math.min(1 - newCropSw, centerSx - newCropSw / 2)),
        cropSy: Math.max(0, Math.min(1 - newCropSh, centerSy - newCropSh / 2)),
      }
      const patch = patchCropForItemOrKeyframe(item as ImageClass, kfId, updates, pt)
      const isImage = images.some(i => i.id === cropEditId)
      if (isImage) {
        updateImage(item.id, patch as Partial<ImageClass>)
      } else {
        updateVideo(item.id, patch as Partial<VideoClass>)
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [cropEditId, images, videos, updateImage, updateVideo, canvasRef, cropNaturalSize, aspectRatio, selectedKeyframeId, playbackTime])

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

    const wheelItemHistoryIdleMs = 240

    const scheduleWheelItemHistoryCommit = () => {
      if (wheelItemCommitTimerRef.current !== null) {
        clearTimeout(wheelItemCommitTimerRef.current)
      }
      wheelItemCommitTimerRef.current = setTimeout(() => {
        wheelItemCommitTimerRef.current = null
        if (wheelItemHistoryActiveRef.current) {
          useManifestStore.getState().resumeHistory()
          useManifestStore.getState().pushHistory()
          wheelItemHistoryActiveRef.current = false
        }
      }, wheelItemHistoryIdleMs)
    }

    const ensureWheelItemHistoryPaused = () => {
      if (!wheelItemHistoryActiveRef.current) {
        useManifestStore.getState().pauseHistory()
        wheelItemHistoryActiveRef.current = true
      }
    }

    const flushWheelItemResize = () => {
      wheelItemFlushRafRef.current = null
      const p = pendingWheelItemResizeRef.current
      if (!p || p.gen !== wheelResizeGenRef.current) return
      if (p.kind === 'image') {
        const { id, url, newW, newH, nextX, nextY, gen } = p
        const cur = useManifestStore.getState().images.find((i) => i.id === id)
        if (!cur || cur.url !== url) return
        const applyDims = (nw: number, nh: number) => {
          if (gen !== wheelResizeGenRef.current) return
          const latest = useManifestStore.getState().images.find((i) => i.id === id)
          if (!latest || latest.url !== url) return
          const n = normalizeCropToFrameAspect(
            newW,
            newH,
            nw,
            nh,
            latest.cropSx,
            latest.cropSy,
            latest.cropSw,
            latest.cropSh,
            0.05
          )
          const base = { width: newW, height: newH, x: nextX, y: nextY }
          updateImage(id, n ? { ...base, ...n } : base)
        }
        const cached = naturalSizeCacheRef.current.get(url)
        if (cached) {
          applyDims(cached.nw, cached.nh)
        } else {
          void loadNaturalMediaSize(url, 'image')
            .then(({ nw, nh }) => {
              naturalSizeCacheRef.current.set(url, { nw, nh })
              applyDims(nw, nh)
            })
            .catch(() => {})
        }
      } else {
        const { id, url, newW, newH, nextX, nextY, gen } = p
        const cur = useManifestStore.getState().videos.find((v) => v.id === id)
        if (!cur || cur.url !== url) return
        const applyDims = (nw: number, nh: number) => {
          if (gen !== wheelResizeGenRef.current) return
          const latest = useManifestStore.getState().videos.find((v) => v.id === id)
          if (!latest || latest.url !== url) return
          const n = normalizeCropToFrameAspect(
            newW,
            newH,
            nw,
            nh,
            latest.cropSx ?? 0,
            latest.cropSy ?? 0,
            latest.cropSw ?? 1,
            latest.cropSh ?? 1,
            0.05
          )
          const base = { width: newW, height: newH, x: nextX, y: nextY }
          updateVideo(id, n ? { ...base, ...n } : base)
        }
        const cached = naturalSizeCacheRef.current.get(url)
        if (cached) {
          applyDims(cached.nw, cached.nh)
        } else {
          void loadNaturalMediaSize(url, 'video')
            .then(({ nw, nh }) => {
              naturalSizeCacheRef.current.set(url, { nw, nh })
              applyDims(nw, nh)
            })
            .catch(() => {})
        }
      }
    }

    const scheduleWheelItemFlush = () => {
      if (wheelItemFlushRafRef.current !== null) return
      wheelItemFlushRafRef.current = requestAnimationFrame(() => {
        flushWheelItemResize()
      })
    }

    const handleWheel = (e: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return

      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.002)
      wheelResizeGenRef.current += 1
      const resizeGen = wheelResizeGenRef.current
      const store = useManifestStore.getState()

      ensureWheelItemHistoryPaused()
      scheduleWheelItemHistoryCommit()

      if (selectedImageId) {
        const img = store.images.find((i) => i.id === selectedImageId)
        if (!img?.url) return
        const { logicalW, logicalH } = getLogicalCanvasDimensions(aspectRatio)
        let newWidth = Math.max(50, img.width * factor)
        let newHeight = img.height * (newWidth / img.width)
        const centerX = img.x + img.width / 2
        const centerY = img.y + img.height / 2
        const c = clampPlacementRectToLogicalCanvas(
          newWidth,
          newHeight,
          centerX,
          centerY,
          logicalW,
          logicalH
        )
        pendingWheelItemResizeRef.current = {
          kind: 'image',
          id: selectedImageId,
          url: img.url,
          newW: c.width,
          newH: c.height,
          nextX: c.x,
          nextY: c.y,
          gen: resizeGen,
        }
        scheduleWheelItemFlush()
      } else if (selectedVideoId) {
        const vid = store.videos.find((v) => v.id === selectedVideoId)
        if (!vid?.url) return
        const { logicalW, logicalH } = getLogicalCanvasDimensions(aspectRatio)
        let newWidth = Math.max(50, vid.width * factor)
        let newHeight = vid.height * (newWidth / vid.width)
        const centerX = vid.x + vid.width / 2
        const centerY = vid.y + vid.height / 2
        const c = clampPlacementRectToLogicalCanvas(
          newWidth,
          newHeight,
          centerX,
          centerY,
          logicalW,
          logicalH
        )
        pendingWheelItemResizeRef.current = {
          kind: 'video',
          id: selectedVideoId,
          url: vid.url,
          newW: c.width,
          newH: c.height,
          nextX: c.x,
          nextY: c.y,
          gen: resizeGen,
        }
        scheduleWheelItemFlush()
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      document.removeEventListener('wheel', handleWheel)
      if (wheelItemFlushRafRef.current !== null) {
        cancelAnimationFrame(wheelItemFlushRafRef.current)
        wheelItemFlushRafRef.current = null
      }
      if (wheelItemCommitTimerRef.current !== null) {
        clearTimeout(wheelItemCommitTimerRef.current)
        wheelItemCommitTimerRef.current = null
      }
      if (wheelItemHistoryActiveRef.current) {
        useManifestStore.getState().resumeHistory()
        useManifestStore.getState().pushHistory()
        wheelItemHistoryActiveRef.current = false
      }
    }
  }, [selectedImageId, selectedVideoId, updateImage, updateVideo, cropEditId, canvasRef, aspectRatio])

  return {
    snapLines,
    cropEditId,
    setCropEditId,
    cropPanState,
    setCropPanState,
    enterCropEdit,
    exitCropEdit,
    handleOverlayMouseDown,
    handleImageRotationMouseDown,
    handleTextMouseDown,
    handleTextResizeStart
  }
}
