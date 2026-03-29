'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { TextClass } from '@/app/models/TextClass'
import { formatTime } from '@/app/lib/timeUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import VideoReplaceModal from './modals/VideoReplaceModal'
import ExportModal from './modals/ExportModal'
import PlaybackControls from './PlaybackControls'
import UnifiedRow from './tracks/UnifiedRow'
import AudioTrack from './tracks/AudioTrack'
import MainTrack from './tracks/MainTrack'
import ContextMenu from './ui/ContextMenu'
import { useTimelineShortcuts } from '@/app/hooks/useTimelineShortcuts'
import { useTimelineScroll } from '@/app/hooks/timeline/useTimelineScroll'
import { useVideoThumbnails } from '@/app/hooks/timeline/useVideoThumbnails'
import { useTimelineExport } from '@/app/hooks/timeline/useTimelineExport'
import { useTimelineMedia } from '@/app/hooks/timeline/useTimelineMedia'
import { useTimelineReplace } from '@/app/hooks/timeline/useTimelineReplace'
import { useTimelineDrag } from '@/app/hooks/timeline/useTimelineDrag'
import styles from './tracks/Timeline.module.css'

interface TimelineProps {
  onOpenTransitions?: (id: string) => void
  onCloseTransitions?: () => void
  onOpenAnimations?: (id?: string) => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
  onOpenSpeed?: (id: string) => void
}

export default function Timeline({ onOpenTransitions, onCloseTransitions, onOpenAnimations, onOpenFont, onOpenEffects, onOpenSpeed }: TimelineProps) {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const audios = useManifestStore((state) => state.audios)
  const effects = useManifestStore((state) => state.effects)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)
  const setSelectedAudioId = useSelectionStore((state) => state.setSelectedAudioId)
  const setSelectedEffectId = useSelectionStore((state) => state.setSelectedEffectId)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectedEffectId = useSelectionStore((state) => state.selectedEffectId)

  const addVideo = useManifestStore((state) => state.addVideo)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const addImage = useManifestStore((state) => state.addImage)
  const updateImage = useManifestStore((state) => state.updateImage)
  const addText = useManifestStore((state) => state.addText)
  const updateText = useManifestStore((state) => state.updateText)
  const updateEffect = useManifestStore((state) => state.updateEffect)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const getTotalDuration = useManifestStore((state) => state.getTotalDuration)
  const trimVideo = useManifestStore((state) => state.trimVideo)
  const replaceImageWithVideo = useManifestStore((state) => state.replaceImageWithVideo)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const trimAudio = useManifestStore((state) => state.trimAudio)
  const addAudioToManifest = useManifestStore((state) => state.addAudio)
  const updateAudio = useManifestStore((state) => state.updateAudio)

  const setAudio = useAudioStore((state) => state.setAudio)
  const audioUrl = useAudioStore((state) => state.audioUrl)
  const timelineRowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  
  const totalDuration = getTotalDuration()
  const MIN_VISIBLE = 0.5
  const MAX_VISIBLE = 120
  const WHEEL_VERTICAL_DOMINANCE_RATIO = 3
  const [visibleDuration, setVisibleDuration] = useState(8)
  const effectivePadding = visibleDuration / 2
  const visibleDurationRef = useRef(8)
  const totalTimelineWidth = totalDuration > 0 ? ((totalDuration + effectivePadding * 2) / visibleDuration) * 100 : 100

  const { handleScroll, isScrollingProgrammatically } = useTimelineScroll({
    scrollContainerRef,
    totalDuration,
    effectivePadding,
    isPlaying,
    playbackTime,
    setPlaybackTime,
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
    handleOverlayVideoDragStart,
    handleTextDragStart,
    handleEffectDragStart
  } = useTimelineDrag({
    videos,
    images,
    texts,
    audios,
    totalDuration,
    effectivePadding,
    timelineRowRef,
    setIsPlaying,
    trimVideo,
    updateImage,
    updateVideo,
    updateText,
    updateEffect,
    trimAudio,
    moveItemToRow: useManifestStore.getState().moveItemToRow,
    insertRow: useManifestStore.getState().insertRow,
    deleteRow: useManifestStore.getState().deleteRow,
    pushHistory,
  })

  const overlayRows = useMemo(() => {
    const rows = new Set<number>()
    videos.forEach(v => { if (v.row > 0) rows.add(v.row) })
    images.forEach(img => { if (img.row > 0) rows.add(img.row) })
    texts.forEach(t => { if (t.row > 0) rows.add(t.row) })
    audios.forEach(a => { if (a.row > 0) rows.add(a.row) })
    effects.forEach((e) => rows.add(e.row))
    if (activeDrag && dragPreview && dragPreview.targetRow > 0 && !rows.has(dragPreview.targetRow)) {
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
    aspectRatio,
    images,
    audioUrl,
    texts,
    audios,
    effects,
    setIsPlaying,
  })

  const { handleFileSelect } = useTimelineMedia({
    videos,
    images,
    playbackTime,
    aspectRatio,
    addVideo,
    addImage,
    addAudioToManifest,
    setAudio,
    updateAudio,
    audios,
  })

  const { replaceTargetId, setReplaceTargetId, replaceVideoData, setReplaceVideoData, isReplacingClip, handleReplaceSelect, handleConfirmReplaceVideo, handleVideoDoubleClick } = useTimelineReplace({
    videos,
    images,
    replaceImageWithVideo,
    replaceVideoWithImage,
    updateVideo,
  })

  const getContentPosition = useCallback((time: number) => {
    const timeWithPadding = time + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    if (totalWithPadding === 0) return 0
    return (timeWithPadding / totalWithPadding) * 100
  }, [effectivePadding, totalDuration])

  const handleTimelineDeselect = useCallback(() => {
    setSelectedVideoId(null)
    setSelectedImageId(null)
    setSelectedTextId(null)
    setSelectedAudioId(null)
    setSelectedEffectId(null)
  }, [setSelectedVideoId, setSelectedImageId, setSelectedTextId, setSelectedAudioId, setSelectedEffectId])

  const handleAddText = () => {
    const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const start = playbackTime
    const end = start + 5
    const row = findFreeVisualOverlayRow(start, end)
    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const baseFontSize = 96
    const textWidth = Math.round(logicalW * 0.4)
    const fontSize = baseFontSize
    const textLogicalHeight = fontSize * 1.2
    const defaultX = Math.round((logicalW - textWidth) / 2)
    const defaultY = Math.round((logicalH - textLogicalHeight) / 2)
    addText(new TextClass(
      id,
      'Text',
      start,
      end,
      defaultX,
      defaultY,
      textWidth,
      undefined,
      undefined,
      fontSize,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined, // style
      undefined, // createdAt
      row
    ))
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
    applyZoom,
    visibleDurationRef,
    MIN_VISIBLE,
    MAX_VISIBLE,
    selectedAudioId,
    setSelectedAudioId,
    uploadInputRef,
  })

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (replaceVideoData) return
      const container = scrollContainerRef.current
      if (!container || !container.contains(e.target as Node)) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = Math.exp(e.deltaY * 0.005)
        const next = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, visibleDurationRef.current * factor))
        applyZoom(next)
      } else {
        e.preventDefault()
        if (!useManifestStore.getState().isPlaying) {
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
              const atLeftEdge = container.scrollLeft === 0
              container.scrollLeft += horizontalDelta
              if (atLeftEdge && horizontalDelta < 0) {
                useManifestStore.getState().setPlaybackTime(0)
              }
            }
          } else {
            const delta = deltaX + deltaY
            const atLeftEdge = container.scrollLeft === 0
            container.scrollLeft += delta
            if (atLeftEdge && delta < 0) {
              useManifestStore.getState().setPlaybackTime(0)
            }
          }
        }
      }
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [applyZoom, replaceVideoData])

  return (
    <div className={styles.container}>
      <ExportModal
        open={exportModalOpen}
        aspectRatio={aspectRatio}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportResult={exportResult}
        onClose={closeExportModal}
      />
      {replaceVideoData && (
        <VideoReplaceModal
          videoUrl={replaceVideoData.url}
          windowDuration={replaceVideoData.windowDuration}
          videoDuration={replaceVideoData.duration}
          playbackSpeed={replaceVideoData.playbackSpeed}
          initialTrimStart={replaceVideoData.initialTrimStart}
          projectStartTime={replaceVideoData.projectStartTime}
          confirmLabel={replaceVideoData.targetType === 'image' ? 'Replace' : 'Update'}
          isProcessing={isReplacingClip}
          onConfirm={handleConfirmReplaceVideo}
          onCancel={() => {
            if (replaceVideoData.isNew) {
              URL.revokeObjectURL(replaceVideoData.url)
            }
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
        {videos.length === 0 && images.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No content yet. Generate a video in the chat or</p>
            <button
              className={styles.uploadVideoButton}
              onClick={() => uploadInputRef.current?.click()}
            >
              upload a file
            </button>
          </div>
        ) : (
          <div className={styles.timelineWrapper}>
            <PlaybackControls
              playbackTime={playbackTime}
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
              <div ref={scrollContainerRef} className={styles.scrollContainer} onScroll={handleScroll}>
                <div
                  ref={timelineRowRef}
                  className={`${styles.timelineContent} ${activeDrag || holdDragPreview ? styles.draggingActive : ''}`}
                  style={{ width: `${totalTimelineWidth}%` }}
                  onClick={handleTimelineDeselect}
                >
                  <AudioTrack
                    totalDuration={totalDuration}
                    effectivePadding={effectivePadding}
                    getContentPosition={getContentPosition}
                    handleAudioBodyDragStart={handleAudioBodyDragStart}
                    handleAudioTrimStart={handleAudioTrimStart}
                  />
                  {overlayRows.map((rowIndex) => (
                    <UnifiedRow
                      key={`unified-row-${rowIndex}`}
                      rowIndex={rowIndex}
                      showEmptyForDrag={Boolean(activeDrag && dragPreview && dragPreview.targetRow === rowIndex)}
                      getContentPosition={getContentPosition}
                      totalDuration={totalDuration}
                      effectivePadding={effectivePadding}
                      handleImageDragStart={handleImageDragStart}
                      handleOverlayVideoDragStart={handleOverlayVideoDragStart}
                      handleTrimStart={handleTrimStart}
                      handleTextDragStart={handleTextDragStart}
                      handleEffectDragStart={handleEffectDragStart}
                      handleAudioBodyDragStart={handleAudioBodyDragStart}
                      handleAudioTrimStart={handleAudioTrimStart}
                      handleVideoDoubleClick={handleVideoDoubleClick}
                      onOpenEffects={onOpenEffects}
                      onCloseTransitions={onCloseTransitions}
                    />
                  ))}
                  <MainTrack
                    getContentPosition={getContentPosition}
                    totalDuration={totalDuration}
                    effectivePadding={effectivePadding}
                    setSelectedVideoId={setSelectedVideoId}
                    setSelectedImageId={setSelectedImageId}
                    handleTrimStart={handleTrimStart}
                    handleVideoDoubleClick={handleVideoDoubleClick}
                    replaceTargetId={replaceTargetId}
                    setReplaceTargetId={setReplaceTargetId}
                    replaceInputRef={replaceInputRef}
                    videoThumbnails={videoThumbnails}
                    scrollContainerRef={scrollContainerRef}
                    handleImageDragStart={handleImageDragStart}
                    onOpenTransitions={onOpenTransitions}
                    onCloseTransitions={onCloseTransitions}
                  />

                  {(() => {
                    const ui =
                      holdDragPreview ??
                      (activeDrag && dragPreview
                        ? {
                            targetRow: dragPreview.targetRow,
                            targetTime: dragPreview.targetTime,
                            isInsertion: dragPreview.isInsertion,
                            isValid: dragPreview.isValid,
                            duration: activeDrag.duration,
                            itemType: activeDrag.itemType,
                          }
                        : null)
                    if (!ui) return null
                    return (
                      <>
                        <div
                          className={styles.dragPreview}
                          style={{
                            left: `${getContentPosition(ui.targetTime)}%`,
                            width: `${(ui.duration / (totalDuration + effectivePadding * 2)) * 100}%`,
                            top: (() => {
                              const container = timelineRowRef.current
                              if (!container) return 0
                              const rowEls = Array.from(container.children).filter(
                                (child) => child.getAttribute('data-row-index') === String(ui.targetRow)
                              )
                              if (rowEls.length > 0) {
                                return (rowEls[0] as HTMLElement).offsetTop
                              }
                              return 0
                            })(),
                            height: '40px',
                            opacity: ui.isValid ? 0.5 : 0.2,
                            backgroundColor: ui.isValid ? '#ffffff' : '#ff4a4a',
                          }}
                        >
                          {ui.itemType}
                        </div>
                        {ui.isInsertion && (
                          <div
                            className={styles.insertionIndicator}
                            style={{
                              left: `${getContentPosition(0)}%`,
                              width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
                              top: (() => {
                                const container = timelineRowRef.current
                                if (!container) return 0
                                const rowEls = Array.from(container.children).filter(
                                  (child) => child.getAttribute('data-row-index') === String(ui.targetRow)
                                )
                                if (rowEls.length > 0) {
                                  return (rowEls[0] as HTMLElement).offsetTop - 4
                                }
                                return 0
                              })(),
                            }}
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
            <ContextMenu
              playbackTime={playbackTime}
              onOpenTransitions={onOpenTransitions}
              onOpenAnimations={onOpenAnimations}
              onOpenFont={onOpenFont}
              onOpenEffects={onOpenEffects}
              onOpenSpeed={onOpenSpeed}
              onReplace={(id) => {
                setReplaceTargetId(id)
                replaceInputRef.current?.click()
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
