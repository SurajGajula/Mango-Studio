'use client'

import { useRef, useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { TextClass } from '@/app/models/TextClass'
import { buildCenteredTextLayout, getSharedTextMeasureCtx } from '@/app/lib/drawTextOverlay'
import { formatTime } from '@/app/lib/timeUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import VideoReplaceModal from './modals/VideoReplaceModal'
import AudioTrimModal from './modals/AudioTrimModal'
import ReplaceFromLibraryModal from './modals/ReplaceFromLibraryModal'
import BgRemoveModal from './modals/BgRemoveModal'
import ExportModal from './modals/ExportModal'
import PlaybackControls from './PlaybackControls'
import UnifiedRow from './tracks/UnifiedRow'
import ContextMenu from './ui/ContextMenu'
import { useTimelineShortcuts } from '@/app/hooks/useTimelineShortcuts'
import { useTimelineScroll } from '@/app/hooks/timeline/useTimelineScroll'
import { useVideoThumbnails } from '@/app/hooks/timeline/useVideoThumbnails'
import { useTimelineExport } from '@/app/hooks/timeline/useTimelineExport'
import { useTimelineMedia } from '@/app/hooks/timeline/useTimelineMedia'
import { useTimelineReplace } from '@/app/hooks/timeline/useTimelineReplace'
import { useTimelineDrag } from '@/app/hooks/timeline/useTimelineDrag'
import { accountMediaDragActive, parseAccountMediaDragData } from '@/app/lib/accountMediaDrag'
import { uploadAccountMedia } from '@/app/lib/accountMediaUploadClient'
import { addImageAtTimelineTime } from '@/app/lib/addImageAtPlayhead'
import { clientXToTimelineTime } from '@/app/lib/timelineDropTime'
import { addAudioToTimelineAtTime, addVideoToTimelineAtTime } from '@/app/lib/timelineMediaInsert'
import type { TimelineSelectionItem } from '@/app/hooks/timeline/useTimelineDrag'
import styles from './tracks/Timeline.module.css'

interface TimelineProps {
  onOpenTransitions?: (id: string) => void
  onOpenAnimations?: (id?: string) => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
  onOpenSpeed?: (id: string) => void
  onOpenPitch?: (id: string) => void
}

export default function Timeline({ onOpenTransitions, onOpenAnimations, onOpenFont, onOpenEffects, onOpenSpeed, onOpenPitch }: TimelineProps) {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const audios = useManifestStore((state) => state.audios)
  const effects = useManifestStore((state) => state.effects)
  const playbackTime = useManifestStore(
    (state) => state.playbackTime,
    (left, right) => Math.abs(left - right) < 0.045
  )
  const isPlaying = useManifestStore((state) => state.isPlaying)
  
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)
  const setSelectedAudioId = useSelectionStore((state) => state.setSelectedAudioId)
  const setSelectedEffectId = useSelectionStore((state) => state.setSelectedEffectId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectedEffectId = useSelectionStore((state) => state.selectedEffectId)

  const updateImage = useManifestStore((state) => state.updateImage)
  const addText = useManifestStore((state) => state.addText)
  const updateText = useManifestStore((state) => state.updateText)
  const updateEffect = useManifestStore((state) => state.updateEffect)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const getTotalDuration = useManifestStore((state) => state.getTotalDuration)
  const trimVideo = useManifestStore((state) => state.trimVideo)
  const replaceImageSource = useManifestStore((state) => state.replaceImageSource)
  const replaceImageWithVideo = useManifestStore((state) => state.replaceImageWithVideo)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const trimAudio = useManifestStore((state) => state.trimAudio)

  const timelineRowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const audioReplaceInputRef = useRef<HTMLInputElement>(null)
  
  const totalDuration = getTotalDuration()
  const MIN_VISIBLE = 0.5
  const MAX_VISIBLE = 120
  const WHEEL_VERTICAL_DOMINANCE_RATIO = 3
  const [visibleDuration, setVisibleDuration] = useState(8)
  const effectivePadding = visibleDuration / 2
  const visibleDurationRef = useRef(8)
  const totalTimelineWidth = totalDuration > 0 ? ((totalDuration + effectivePadding * 2) / visibleDuration) * 100 : 100

  const [replaceLibraryTarget, setReplaceLibraryTarget] = useState<{ id: string; media: 'visual' | 'audio' } | null>(null)
  const [bgRemoveTargetId, setBgRemoveTargetId] = useState<string | null>(null)
  const [multiSelectedItems, setMultiSelectedItems] = useState<TimelineSelectionItem[]>([])
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const suppressNextTimelineClickRef = useRef(false)
  const selectionDragRef = useRef<{
    originX: number
    originY: number
    containerRect: DOMRect
  } | null>(null)
  const { handleScroll, isScrollingProgrammatically } = useTimelineScroll({
    scrollContainerRef,
    totalDuration,
    effectivePadding,
    isPlaying,
    playbackTime,
  })

  const { videoThumbnails } = useVideoThumbnails(videos)

  const {
    activeDrag,
    dragPreview,
    holdDragPreview,
    handleTrimStart,
    handleAudioTrimStart,
    handleAudioBodyDragStart,
    handleImageDragStart,
    handleVideoDragStart,
    handleTextDragStart,
    handleEffectDragStart
  } = useTimelineDrag({
    videos,
    images,
    texts,
    audios,
    totalDuration,
    effectivePadding,
    visibleDuration,
    timelineRowRef,
    setIsPlaying,
    trimVideo,
    updateImage,
    updateText,
    updateEffect,
    trimAudio,
    moveItemToRow: useManifestStore.getState().moveItemToRow,
    insertRow: useManifestStore.getState().insertRow,
    pushHistory,
    multiSelectedItems,
  })

  const trackRows = useMemo(() => {
    const rows = new Set<number>()
    videos.forEach((v) => rows.add(v.row))
    images.forEach((img) => rows.add(img.row))
    texts.forEach((t) => rows.add(t.row))
    audios.forEach((a) => rows.add(a.row))
    effects.forEach((e) => rows.add(e.row))
    if (activeDrag && dragPreview && dragPreview.targetRow >= 0 && !rows.has(dragPreview.targetRow)) {
      rows.add(dragPreview.targetRow)
    }
    return Array.from(rows).sort((a, b) => b - a)
  }, [videos, images, texts, audios, effects, activeDrag, dragPreview])

  const {
    isExporting,
    exportProgress,
    exportModalOpen,
    exportResult,
    handleExport,
    closeExportModal,
  } = useTimelineExport({
    videos,
    images,
    texts,
    audios,
    effects,
    setIsPlaying,
  })

  const { handleFileSelect } = useTimelineMedia()

  const {
    replaceTargetId,
    setReplaceTargetId,
    replaceVideoData,
    setReplaceVideoData,
    isReplacingClip,
    handleReplaceSelect,
    applyReplaceFromUrl,
    handleConfirmReplaceVideo,
    handleVideoDoubleClick,
    audioReplaceTargetId,
    setAudioReplaceTargetId,
    handleAudioReplaceSelect,
    applyReplaceAudioFromUrl,
    replaceAudioData,
    handleAudioDoubleClick,
    handleConfirmAudioTrim,
    clearReplaceAudioFlow,
  } = useTimelineReplace({
    videos,
    images,
    audios,
    replaceImageWithVideo,
    replaceVideoWithImage,
  })

  const videoReplaceFilePickerRequest = useManifestStore((s) => s.videoReplaceFilePickerRequest)
  const setVideoReplaceFilePickerRequestStore = useManifestStore((s) => s.setVideoReplaceFilePickerRequest)

  useLayoutEffect(() => {
    if (!videoReplaceFilePickerRequest) return
    const { videoId } = videoReplaceFilePickerRequest
    setVideoReplaceFilePickerRequestStore(null)
    setReplaceTargetId(videoId)
    window.setTimeout(() => {
      replaceInputRef.current?.click()
    }, 0)
  }, [videoReplaceFilePickerRequest, setReplaceTargetId, setVideoReplaceFilePickerRequestStore])

  const getContentPosition = useCallback((time: number) => {
    const timeWithPadding = time + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    if (totalWithPadding === 0) return 0
    return (timeWithPadding / totalWithPadding) * 100
  }, [effectivePadding, totalDuration])

  const getDragPreviewTop = useCallback(
    (targetRow: number, itemType: 'video' | 'image' | 'text' | 'audio' | 'effect') => {
      const container = timelineRowRef.current
      if (!container) return 0
      const visualRow = itemType === 'audio' && targetRow === 0 ? -1 : targetRow
      const rowEl = Array.from(container.children).find(
        (child) => child.getAttribute('data-row-index') === String(visualRow)
      )
      return rowEl instanceof HTMLElement ? rowEl.offsetTop : 0
    },
    []
  )

  const handleAccountMediaDragOverCapture = useCallback((e: React.DragEvent) => {
    if (accountMediaDragActive(e.dataTransfer)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleAccountMediaDropCapture = useCallback(
    async (e: React.DragEvent) => {
      const payload = parseAccountMediaDragData(e.dataTransfer)
      if (!payload) return
      e.preventDefault()
      e.stopPropagation()
      const scrollEl = scrollContainerRef.current
      const t = scrollEl
        ? clientXToTimelineTime(e.clientX, scrollEl, totalDuration, effectivePadding)
        : 0
      const url = `/api/media/asset/${payload.id}`
      try {
        if (payload.kind === 'video') {
          await addVideoToTimelineAtTime(url, payload.name, t)
        } else if (payload.kind === 'audio') {
          await addAudioToTimelineAtTime(url, payload.name, t)
        } else {
          await addImageAtTimelineTime(url, payload.name, t)
        }
      } catch (err) {
        console.error(err)
      }
    },
    [totalDuration, effectivePadding]
  )

  const handleTimelineDeselect = useCallback(() => {
    setSelectedVideoId(null)
    setSelectedImageId(null)
    setSelectedTextId(null)
    setSelectedAudioId(null)
    setSelectedEffectId(null)
    setMultiSelectedItems([])
  }, [setSelectedVideoId, setSelectedImageId, setSelectedTextId, setSelectedAudioId, setSelectedEffectId])

  const updateSelectionByItems = useCallback(
    (items: TimelineSelectionItem[]) => {
      setMultiSelectedItems(items)
      const first = items[0]
      if (!first) {
        handleTimelineDeselect()
        return
      }
      if (first.type === 'video') setSelectedVideoId(first.id)
      else if (first.type === 'image') setSelectedImageId(first.id)
      else if (first.type === 'text') setSelectedTextId(first.id)
      else if (first.type === 'audio') setSelectedAudioId(first.id)
      else setSelectedEffectId(first.id)
    },
    [
      handleTimelineDeselect,
      setSelectedVideoId,
      setSelectedImageId,
      setSelectedTextId,
      setSelectedAudioId,
      setSelectedEffectId,
    ]
  )

  const handleSelectionToggle = useCallback(
    (item: TimelineSelectionItem, additive: boolean) => {
      if (!additive) {
        updateSelectionByItems([item])
        return
      }
      setMultiSelectedItems((prev) => {
        const exists = prev.some((entry) => entry.id === item.id && entry.type === item.type)
        const next = exists
          ? prev.filter((entry) => !(entry.id === item.id && entry.type === item.type))
          : [...prev, item]
        if (next.length === 0) {
          handleTimelineDeselect()
        } else {
          const first = next[0]
          if (first.type === 'video') setSelectedVideoId(first.id)
          else if (first.type === 'image') setSelectedImageId(first.id)
          else if (first.type === 'text') setSelectedTextId(first.id)
          else if (first.type === 'audio') setSelectedAudioId(first.id)
          else setSelectedEffectId(first.id)
        }
        return next
      })
    },
    [
      updateSelectionByItems,
      handleTimelineDeselect,
      setSelectedVideoId,
      setSelectedImageId,
      setSelectedTextId,
      setSelectedAudioId,
      setSelectedEffectId,
    ]
  )

  useEffect(() => {
    const selectedItem: TimelineSelectionItem | null = (() => {
      if (selectedVideoId) {
        return { id: selectedVideoId, type: 'video' }
      }
      if (selectedImageId) {
        return { id: selectedImageId, type: 'image' }
      }
      if (selectedTextId) {
        return { id: selectedTextId, type: 'text' }
      }
      if (selectedAudioId) {
        return { id: selectedAudioId, type: 'audio' }
      }
      if (selectedEffectId) {
        return { id: selectedEffectId, type: 'effect' }
      }
      return null
    })()

    if (!selectedItem) {
      if (multiSelectedItems.length > 0) {
        setMultiSelectedItems([])
      }
      return
    }

    const hasSelectedItem = multiSelectedItems.some(
      (entry) => entry.id === selectedItem.id && entry.type === selectedItem.type
    )

    if (!hasSelectedItem) {
      setMultiSelectedItems([selectedItem])
    }
  }, [
    multiSelectedItems,
    setMultiSelectedItems,
    selectedAudioId,
    selectedEffectId,
    selectedImageId,
    selectedTextId,
    selectedVideoId,
  ])

  const handleSelectionAreaMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-timeline-selectable="true"]')) return
    const rect = scrollContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    selectionDragRef.current = {
      originX: e.clientX,
      originY: e.clientY,
      containerRect: rect,
    }
    const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
    setSelectionBox({
      left: e.clientX - rect.left + scrollLeft,
      top: e.clientY - rect.top + scrollTop,
      width: 0,
      height: 0,
    })
    const additive = e.metaKey || e.ctrlKey
    if (!additive) handleTimelineDeselect()
  }, [handleTimelineDeselect])

  const handleTimelineContentClick = useCallback(() => {
    if (suppressNextTimelineClickRef.current) {
      suppressNextTimelineClickRef.current = false
      return
    }
    handleTimelineDeselect()
  }, [handleTimelineDeselect])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = selectionDragRef.current
      if (!drag || !timelineRowRef.current) return
      const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
      const x1 = drag.originX - drag.containerRect.left + scrollLeft
      const y1 = drag.originY - drag.containerRect.top + scrollTop
      const x2 = e.clientX - drag.containerRect.left + scrollLeft
      const y2 = e.clientY - drag.containerRect.top + scrollTop
      const left = Math.min(x1, x2)
      const top = Math.min(y1, y2)
      const width = Math.abs(x2 - x1)
      const height = Math.abs(y2 - y1)
      setSelectionBox({ left, top, width, height })
    }

    const onMouseUp = (e: MouseEvent) => {
      const drag = selectionDragRef.current
      if (!drag || !timelineRowRef.current) return
      const left = Math.min(drag.originX, e.clientX)
      const top = Math.min(drag.originY, e.clientY)
      const right = Math.max(drag.originX, e.clientX)
      const bottom = Math.max(drag.originY, e.clientY)
      const additive = e.metaKey || e.ctrlKey
      const hitItems: TimelineSelectionItem[] = []
      const selectableEls = timelineRowRef.current.querySelectorAll<HTMLElement>('[data-timeline-selectable="true"]')
      selectableEls.forEach((el) => {
        const r = el.getBoundingClientRect()
        const overlapX = Math.min(right, r.right) - Math.max(left, r.left)
        const overlapY = Math.min(bottom, r.bottom) - Math.max(top, r.top)
        const selectionTolerancePx = 3
        const intersects = overlapX >= -selectionTolerancePx && overlapY >= -selectionTolerancePx
        if (!intersects) return
        const id = el.dataset.timelineItemId
        const type = el.dataset.timelineItemType as TimelineSelectionItem['type'] | undefined
        if (!id || !type) return
        hitItems.push({ id, type })
      })
      if (hitItems.length > 0) {
        if (additive) {
          setMultiSelectedItems((prev) => {
            const key = (item: TimelineSelectionItem) => `${item.type}:${item.id}`
            const map = new Map(prev.map((entry) => [key(entry), entry]))
            hitItems.forEach((entry) => map.set(key(entry), entry))
            const merged = Array.from(map.values())
            const first = merged[0]
            if (first) {
              if (first.type === 'video') setSelectedVideoId(first.id)
              else if (first.type === 'image') setSelectedImageId(first.id)
              else if (first.type === 'text') setSelectedTextId(first.id)
              else if (first.type === 'audio') setSelectedAudioId(first.id)
              else setSelectedEffectId(first.id)
            }
            return merged
          })
        } else {
          updateSelectionByItems(hitItems)
        }
      }
      suppressNextTimelineClickRef.current = true
      selectionDragRef.current = null
      setSelectionBox(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [
    setSelectedVideoId,
    setSelectedImageId,
    setSelectedTextId,
    setSelectedAudioId,
    setSelectedEffectId,
    updateSelectionByItems,
  ])

  const handleApplyBgRemovedImage = useCallback(
    async (imageId: string, outputBlob: Blob) => {
      const image = images.find((item) => item.id === imageId)
      if (!image) {
        throw new Error('Image not found')
      }
      const outputFile = new File([outputBlob], `${image.name}-bg-removed.png`, { type: 'image/png' })
      const sourceAssetMatch = image.url.match(/\/api\/media\/asset\/([^/?#]+)/)
      const asset = await uploadAccountMedia({
        file: outputFile,
        storageScope: 'bg-removed',
        sourceAssetId: sourceAssetMatch?.[1] ?? null,
      })
      replaceImageSource(imageId, `/api/media/asset/${asset.id}`, image.name)
    },
    [images, replaceImageSource]
  )

  const handleAddText = () => {
    const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const start = useManifestStore.getState().playbackTime
    const end = start + 5
    const row = findFreeVisualOverlayRow(start, end)
    const placement = buildCenteredTextLayout({ content: 'Text' }, getSharedTextMeasureCtx())
    addText(new TextClass(id, 'Text', start, end).copy({ row, ...placement }))
  }

  const applyZoom = useCallback((newVisible: number) => {
    visibleDurationRef.current = newVisible
    isScrollingProgrammatically.current = true
    setVisibleDuration(newVisible)
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return
      const newPadding = newVisible / 2
      const playTime = useManifestStore.getState().playbackTime
      const dur = getTotalDuration()
      const totalWithPadding = dur + newPadding * 2
      const pct = totalWithPadding > 0 ? (playTime + newPadding) / totalWithPadding : 0
      container.scrollLeft = Math.max(0, pct * container.scrollWidth - container.clientWidth / 2)
      setTimeout(() => { isScrollingProgrammatically.current = false }, 50)
    })
  }, [getTotalDuration, isScrollingProgrammatically])

  useTimelineShortcuts({
    replaceVideoData,
    replaceAudioData,
    applyZoom,
    visibleDurationRef,
    MIN_VISIBLE,
    MAX_VISIBLE,
    selectedAudioId,
    setSelectedAudioId,
    uploadInputRef,
    multiSelectedItems,
    setMultiSelectedItems,
  })

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handler = (e: WheelEvent) => {
      if (replaceVideoData || replaceAudioData) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = Math.exp(e.deltaY * 0.005)
        const next = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, visibleDurationRef.current * factor))
        applyZoom(next)
        return
      }
      e.preventDefault()
      const deltaX = e.deltaX
      const deltaY = e.deltaY
      const canScrollY = container.scrollHeight > container.clientHeight + 1
      if (canScrollY) {
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
        const topBefore = container.scrollTop
        const nextTop = Math.min(maxTop, Math.max(0, topBefore + deltaY))
        const appliedY = nextTop - topBefore
        container.scrollTop = nextTop
        const remainderY = deltaY - appliedY
        const verticalDominant =
          Math.abs(deltaY) >= Math.abs(deltaX) * WHEEL_VERTICAL_DOMINANCE_RATIO
        const horizontalFromAxis = verticalDominant ? 0 : deltaX
        const horizontalDelta = horizontalFromAxis + remainderY
        if (horizontalDelta !== 0) {
          const atLeftEdgeBefore = container.scrollLeft <= 1
          container.scrollLeft += horizontalDelta
          const atLeftEdgeAfter = container.scrollLeft <= 1
          if ((atLeftEdgeBefore || atLeftEdgeAfter) && horizontalDelta < 0) {
            useManifestStore.getState().setPlaybackTime(0)
          }
        }
      } else {
        const delta = deltaX + deltaY
        const atLeftEdgeBefore = container.scrollLeft <= 1
        container.scrollLeft += delta
        const atLeftEdgeAfter = container.scrollLeft <= 1
        if ((atLeftEdgeBefore || atLeftEdgeAfter) && delta < 0) {
          useManifestStore.getState().setPlaybackTime(0)
        }
      }
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [applyZoom, replaceVideoData, replaceAudioData])

  return (
    <div className={styles.container}>
      <ExportModal
        open={exportModalOpen}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportResult={exportResult}
        onClose={closeExportModal}
      />
      <ReplaceFromLibraryModal
        open={replaceLibraryTarget !== null}
        mediaFilter={replaceLibraryTarget?.media ?? 'visual'}
        onClose={() => setReplaceLibraryTarget(null)}
        onPick={async (asset) => {
          if (!replaceLibraryTarget) return
          const url = `/api/media/asset/${asset.id}`
          if (replaceLibraryTarget.media === 'audio') {
            if (asset.kind !== 'audio') return
            await applyReplaceAudioFromUrl(replaceLibraryTarget.id, url, asset.name)
            return
          }
          if (asset.kind !== 'image' && asset.kind !== 'video') return
          await applyReplaceFromUrl(replaceLibraryTarget.id, url, asset.name, asset.kind)
        }}
      />
      {(() => {
        if (!bgRemoveTargetId) return null
        const target = images.find((item) => item.id === bgRemoveTargetId)
        if (!target) return null
        return (
          <BgRemoveModal
            open
            imageUrl={target.url}
            imageName={target.name}
            onClose={() => setBgRemoveTargetId(null)}
            onApply={async (blob) => {
              await handleApplyBgRemovedImage(target.id, blob)
              setBgRemoveTargetId(null)
            }}
          />
        )
      })()}
      {replaceAudioData && (
        <AudioTrimModal
          key={`${replaceAudioData.targetId}-${replaceAudioData.url}-${replaceAudioData.windowDuration}-${replaceAudioData.playbackSpeed}-${replaceAudioData.speedStart ?? ''}-${replaceAudioData.speedEnd ?? ''}-${replaceAudioData.speedEasing ?? ''}-${replaceAudioData.pitch}`}
          audioUrl={replaceAudioData.url}
          windowDuration={replaceAudioData.windowDuration}
          audioDuration={replaceAudioData.duration}
          playbackSpeed={replaceAudioData.playbackSpeed}
          speedStart={replaceAudioData.speedStart}
          speedEnd={replaceAudioData.speedEnd}
          speedEasing={replaceAudioData.speedEasing}
          pitch={replaceAudioData.pitch}
          initialTrimStart={replaceAudioData.initialTrimStart}
          onConfirm={handleConfirmAudioTrim}
          onCancel={clearReplaceAudioFlow}
        />
      )}
      {replaceVideoData && (
        <VideoReplaceModal
          key={`${replaceVideoData.targetId}-${replaceVideoData.url}-${replaceVideoData.windowDuration}-${replaceVideoData.playbackSpeed}-${replaceVideoData.speedStart ?? ''}-${replaceVideoData.speedEnd ?? ''}-${replaceVideoData.speedEasing ?? ''}`}
          videoUrl={replaceVideoData.url}
          windowDuration={replaceVideoData.windowDuration}
          videoDuration={replaceVideoData.duration}
          playbackSpeed={replaceVideoData.playbackSpeed}
          speedStart={replaceVideoData.speedStart}
          speedEnd={replaceVideoData.speedEnd}
          speedEasing={replaceVideoData.speedEasing}
          initialTrimStart={replaceVideoData.initialTrimStart}
          projectStartTime={replaceVideoData.projectStartTime}
          audios={audios}
          confirmLabel={replaceVideoData.targetType === 'image' ? 'Replace' : 'Update'}
          isProcessing={isReplacingClip}
          onConfirm={handleConfirmReplaceVideo}
          onCancel={() => {
            setReplaceVideoData(null)
            setReplaceTargetId(null)
          }}
        />
      )}
      <div className={styles.content}>
        <input
          ref={uploadInputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleReplaceSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={audioReplaceInputRef}
          type="file"
          accept="audio/*"
          onChange={handleAudioReplaceSelect}
          style={{ display: 'none' }}
        />
        <div className={styles.timelineWrapper} data-onboarding="timeline">
          <PlaybackControls
            totalDuration={totalDuration}
            formatTime={formatTime}
            uploadInputRef={uploadInputRef}
            onOpenTransitions={onOpenAnimations}
            onOpenFont={onOpenFont}
            onOpenEffects={onOpenEffects}
            onOpenSpeed={onOpenSpeed}
            isExporting={isExporting}
            handleExport={handleExport}
            handleAddText={handleAddText}
          />
          <div className={styles.timelineRowContainer}>
            <div className={styles.playheadLine} />
            <div
              ref={scrollContainerRef}
              className={styles.scrollContainer}
              onScroll={handleScroll}
              onDragOverCapture={handleAccountMediaDragOverCapture}
              onDropCapture={handleAccountMediaDropCapture}
              onMouseDown={handleSelectionAreaMouseDown}
            >
              <div
                ref={timelineRowRef}
                className={`${styles.timelineContent} ${activeDrag || holdDragPreview ? styles.draggingActive : ''}`}
                style={{ width: `${totalTimelineWidth}%` }}
                onClick={handleTimelineContentClick}
              >
                {trackRows.map((rowIndex) => (
                  <UnifiedRow
                    key={`unified-row-${rowIndex}`}
                    rowIndex={rowIndex}
                    showEmptyForDrag={Boolean(activeDrag && dragPreview && dragPreview.targetRow === rowIndex)}
                    getContentPosition={getContentPosition}
                    totalDuration={totalDuration}
                    effectivePadding={effectivePadding}
                    handleImageDragStart={handleImageDragStart}
                    handleVideoDragStart={handleVideoDragStart}
                    handleTrimStart={handleTrimStart}
                    handleTextDragStart={handleTextDragStart}
                    handleEffectDragStart={handleEffectDragStart}
                    handleAudioBodyDragStart={handleAudioBodyDragStart}
                    handleAudioTrimStart={handleAudioTrimStart}
                    handleVideoDoubleClick={handleVideoDoubleClick}
                    handleAudioDoubleClick={handleAudioDoubleClick}
                    videoThumbnails={videoThumbnails}
                    onOpenTransitions={onOpenTransitions}
                    onOpenEffects={onOpenEffects}
                    multiSelectedItems={multiSelectedItems}
                    onSelectionToggle={handleSelectionToggle}
                  />
                ))}
                {(() => {
                  const ui = holdDragPreview
                  const dragPreviewItems =
                    activeDrag && dragPreview
                      ? (dragPreview.previewItems && dragPreview.previewItems.length > 0
                          ? dragPreview.previewItems
                          : [{
                              itemId: activeDrag.itemId,
                              itemType: activeDrag.itemType,
                              targetRow: dragPreview.targetRow,
                              targetTime: dragPreview.targetTime,
                              duration: activeDrag.duration,
                            }])
                      : []
                  if (!ui && dragPreviewItems.length === 0) return null
                  return (
                    <>
                      {ui && (
                        <div
                          className={styles.dragPreview}
                          style={{
                            left: `${getContentPosition(ui.targetTime)}%`,
                            width: `${(ui.duration / (totalDuration + effectivePadding * 2)) * 100}%`,
                            top: getDragPreviewTop(ui.targetRow, ui.itemType),
                            height: '40px',
                            opacity: ui.isValid ? 0.5 : 0.2,
                            backgroundColor: ui.isValid ? '#ffffff' : '#ff4a4a',
                          }}
                        >
                          {ui.itemType}
                        </div>
                      )}
                      {!ui && dragPreviewItems.map((previewItem) => (
                        <div
                          key={`drag-preview-${previewItem.itemType}-${previewItem.itemId}`}
                          className={styles.dragPreview}
                          style={{
                            left: `${getContentPosition(previewItem.targetTime)}%`,
                            width: `${(previewItem.duration / (totalDuration + effectivePadding * 2)) * 100}%`,
                            top: getDragPreviewTop(previewItem.targetRow, previewItem.itemType),
                            height: '40px',
                            opacity: dragPreview?.isValid ? 0.5 : 0.2,
                            backgroundColor: dragPreview?.isValid ? '#ffffff' : '#ff4a4a',
                          }}
                        >
                          {previewItem.itemType}
                        </div>
                      ))}
                      {(ui?.isInsertion || (dragPreview?.isInsertion && dragPreviewItems.length > 0)) && (
                        <div
                          className={styles.insertionIndicator}
                          style={{
                            left: `${getContentPosition(0)}%`,
                            width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
                            top: getDragPreviewTop(
                              ui ? ui.targetRow : (dragPreviewItems[0]?.targetRow ?? 0),
                              ui ? ui.itemType : (dragPreviewItems[0]?.itemType ?? 'video')
                            ) - 4,
                          }}
                        />
                      )}
                    </>
                  )
                })()}
              </div>
              {selectionBox && (
                <div
                  className={styles.selectionBox}
                  style={{
                    left: selectionBox.left,
                    top: selectionBox.top,
                    width: Math.max(1, selectionBox.width),
                    height: Math.max(1, selectionBox.height),
                  }}
                />
              )}
            </div>
          </div>
          <ContextMenu
            playbackTime={playbackTime}
            onOpenTransitions={onOpenTransitions}
            onOpenAnimations={onOpenAnimations}
            onOpenFont={onOpenFont}
            onOpenEffects={onOpenEffects}
            onOpenSpeed={onOpenSpeed}
            onOpenPitch={onOpenPitch}
            onReplace={(id) => {
              setReplaceTargetId(id)
              replaceInputRef.current?.click()
            }}
            onReplaceFromLibrary={(id) => setReplaceLibraryTarget({ id, media: 'visual' })}
            onReplaceAudio={(id) => {
              setAudioReplaceTargetId(id)
              audioReplaceInputRef.current?.click()
            }}
            onReplaceAudioFromLibrary={(id) => setReplaceLibraryTarget({ id, media: 'audio' })}
            onRemoveBackground={(id) => setBgRemoveTargetId(id)}
          />
        </div>
      </div>
    </div>
  )
}
