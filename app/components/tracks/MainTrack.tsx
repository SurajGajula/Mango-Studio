'use client'

import { useMemo, memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import styles from './Timeline.module.css'

interface MainTrackProps {
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  handleTrimStart: (videoId: string, handle: 'start' | 'end' | null, e: React.MouseEvent) => void
  handleVideoDoubleClick: (videoId: string) => void
  replaceTargetId: string | null
  setReplaceTargetId: (id: string | null) => void
  replaceInputRef: React.RefObject<HTMLInputElement>
  videoThumbnails: Map<string, Map<number, string>>
  scrollContainerRef: React.RefObject<HTMLDivElement>
  handleImageDragStart: (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  onOpenTransitions?: (id: string) => void
  onCloseTransitions?: () => void
}

const MainTrackComponent = ({
  getContentPosition,
  totalDuration,
  effectivePadding,
  setSelectedVideoId,
  setSelectedImageId,
  handleTrimStart,
  handleVideoDoubleClick,
  replaceTargetId,
  setReplaceTargetId,
  replaceInputRef,
  videoThumbnails,
  scrollContainerRef,
  handleImageDragStart,
  onOpenTransitions,
  onCloseTransitions,
}: MainTrackProps) => {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectVideo = useSelectionStore((state) => state.selectVideo)
  const selectImage = useSelectionStore((state) => state.selectImage)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const sortedItems = useMemo(() => {
    const v = videos.filter((v) => !v.isOverlay).map((v) => ({ type: 'video' as const, item: v }))
    const i = images.filter((img) => img.isMainTrack).map((img) => ({ type: 'image' as const, item: img }))
    return [...v, ...i].sort((a, b) => {
      const aStart = a.type === 'video' ? a.item.timestamp : a.item.startTime
      const bStart = b.type === 'video' ? b.item.timestamp : b.item.startTime
      return aStart - bStart
    })
  }, [videos, images])

  const adjacentEpsilon = 0.01

  return (
    <div className={styles.timelineRow} data-row-index={0}>
      {sortedItems.map((entry, idx) => {
        const item = entry.item
        const isVideo = entry.type === 'video'
        const startTime = isVideo ? (item as VideoClass).timestamp : (item as ImageClass).startTime
        const duration = isVideo ? (item as VideoClass).duration : ((item as ImageClass).endTime - (item as ImageClass).startTime)
        const leftPercent = getContentPosition(startTime)
        const widthPercent = totalDuration > 0 && duration ? (duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = isVideo ? selectedVideoId === item.id : selectedImageId === item.id

        const prevEntry = idx > 0 ? sortedItems[idx - 1] : null
        const prevEnd = prevEntry
          ? prevEntry.type === 'video'
            ? (prevEntry.item as VideoClass).timestamp + ((prevEntry.item as VideoClass).duration ?? 0)
            : (prevEntry.item as ImageClass).endTime
          : null
        const showTransitionButton =
          prevEnd !== null && Math.abs(startTime - prevEnd) < adjacentEpsilon

        const transitionButtonLeft = leftPercent

        return (
          <div key={item.id}>
            {showTransitionButton && (
              <button
                className={styles.transitionButton}
                style={{ left: `${transitionButtonLeft}%` }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isVideo) setSelectedVideoId(item.id)
                  else setSelectedImageId(item.id)
                  onOpenTransitions?.(item.id)
                }}
                title="Edit Transition"
              >
                {(item as any).transition === 'none' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                )}
              </button>
            )}
            
            {isVideo ? (() => {
              const v = item as VideoClass
              return (
                <div
                  className={`${styles.timelineItem} ${isSelected ? styles.selected : ''} ${(v.trimStart > 0 || v.trimEnd > 0) ? styles.trimmed : ''}`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    position: 'absolute',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectVideo(isSelected ? null : v.id)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleVideoDoubleClick(v.id)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    selectVideo(v.id)
                    setContextMenu({
                      isOpen: true,
                      x: e.clientX,
                      y: e.clientY,
                      itemId: v.id,
                      itemType: 'video',
                    })
                  }}
                >
                  {isSelected && (
                    <>
                      <div
                        className={styles.trimHandleStart}
                        onMouseDown={(e) => handleTrimStart(v.id, 'start', e)}
                      />
                      <div
                        className={styles.trimHandleEnd}
                        onMouseDown={(e) => handleTrimStart(v.id, 'end', e)}
                      />
                    </>
                  )}
                  <div className={styles.videoBox}>
                    <div className={styles.thumbnailStrip}>
                      {(() => {
                        if (!v.url) return null
                        const allThumbs = videoThumbnails.get(v.url)
                        if (!allThumbs || allThumbs.size === 0) return null
                        
                        const startIdx = Math.floor(v.trimStart)
                        const duration = v.duration ?? 0
                        const endIdx = Math.ceil(v.trimStart + duration)
                        
                        const thumbs: string[] = []
                        for (let s = startIdx; s < endIdx; s++) {
                          const data = allThumbs.get(s)
                          if (data) thumbs.push(data)
                        }
                        
                        if (thumbs.length === 0) return null
                        
                        const thumbWidth = 85
                        // Use a fixed width or a safer calculation to avoid layout thrashing during scroll
                        const containerWidth = scrollContainerRef.current?.clientWidth || 1000
                        const itemWidthPx = (widthPercent / 100) * (scrollContainerRef.current?.scrollWidth || containerWidth * (totalDuration / 8)) // Fallback calculation
                        const totalThumbsWidth = thumbs.length * thumbWidth
                        const repeatCount = Math.max(1, Math.ceil(itemWidthPx / totalThumbsWidth))
                        const repeatedThumbs: string[] = []
                        for (let r = 0; r < repeatCount; r++) {
                          repeatedThumbs.push(...thumbs)
                        }
                        return repeatedThumbs.map((thumb, tIdx) => (
                          <img
                            key={`${v.id}-thumb-${tIdx}`}
                            src={thumb}
                            alt=""
                            className={styles.thumbnail}
                            draggable={false}
                          />
                        ))
                      })()}
                    </div>
                    <div className={styles.videoOverlayText}>
                      <span className={styles.overlayName}>Video #{idx + 1}</span>
                      {(v.trimStart > 0 || v.trimEnd > 0) && (
                        <span className={styles.trimBadge}>
                          {v.trimStart.toFixed(1)}s / {v.trimEnd.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })() : (() => {
              const img = item as ImageClass
              return (
                <div
                  className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute', height: '100%' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectImage(isSelected ? null : img.id)
                  }}
                  onMouseDown={(e) => handleImageDragStart(img.id, 'move', e)}
                  onContextMenu={(e) => {
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
                  }}
                >
                  <div
                    className={styles.overlayHandleStart}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleImageDragStart(img.id, 'start', e)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    className={styles.overlayHandleEnd}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleImageDragStart(img.id, 'end', e)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className={styles.overlayBox}>
                    <img src={img.url} alt={img.name} className={styles.overlayThumbnail} />
                    <span className={styles.overlayName}>Image #{idx + 1}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}

export default memo(MainTrackComponent)
