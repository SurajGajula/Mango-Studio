'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
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
}

export default function MainTrack({
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
}: MainTrackProps) {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectVideo = useSelectionStore((state) => state.selectVideo)
  const selectImage = useSelectionStore((state) => state.selectImage)

  return (
    <div className={styles.timelineRow}>
      {videos.filter((v) => !v.isOverlay).map((video) => {
        const leftPercent = getContentPosition(video.timestamp)
        const widthPercent = totalDuration > 0 && video.duration ? (video.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedVideoId === video.id
        const hasTrim = video.trimStart > 0 || video.trimEnd > 0
        return (
          <div
            key={video.id}
            className={`${styles.timelineItem} ${isSelected ? styles.selected : ''} ${hasTrim ? styles.trimmed : ''}`}
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              position: 'absolute',
            }}
            onClick={(e) => {
              e.stopPropagation()
              selectVideo(isSelected ? null : video.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              handleVideoDoubleClick(video.id)
            }}
          >
            {isSelected && (
              <>
                <div
                  className={styles.trimHandleStart}
                  onMouseDown={(e) => handleTrimStart(video.id, 'start', e)}
                />
                <div
                  className={styles.trimHandleEnd}
                  onMouseDown={(e) => handleTrimStart(video.id, 'end', e)}
                />
              </>
            )}
            {isSelected && (
              <button
                className={`${styles.replaceButton} ${replaceTargetId === video.id ? styles.active : ''}`}
                style={{ right: '42px' }}
                onClick={(e) => { e.stopPropagation(); if (replaceTargetId === video.id) { setReplaceTargetId(null) } else { setReplaceTargetId(video.id); replaceInputRef.current?.click() } }}
                title={replaceTargetId === video.id ? 'Cancel replace' : 'Replace video source'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            )}
            <div className={styles.videoBox}>
              <button
                className={styles.muteButtonMain}
                onClick={(e) => { e.stopPropagation(); updateVideo(video.id, { muted: !video.muted }) }}
                title={video.muted ? 'Unmute video audio' : 'Mute video audio'}
              >
                {video.muted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                )}
              </button>
              <div className={styles.thumbnailStrip}>
                {(() => {
                  if (!video.url) return null
                  const allThumbs = videoThumbnails.get(video.url)
                  if (!allThumbs || allThumbs.size === 0) return null
                  
                  const startIdx = Math.floor(video.trimStart)
                  const duration = video.duration ?? 0
                  const endIdx = Math.ceil(video.trimStart + duration)
                  
                  const thumbs: string[] = []
                  for (let s = startIdx; s < endIdx; s++) {
                    const data = allThumbs.get(s)
                    if (data) thumbs.push(data)
                  }
                  
                  if (thumbs.length === 0) return null
                  
                  const thumbWidth = 85
                  const itemWidthPx = (widthPercent / 100) * (scrollContainerRef.current?.scrollWidth || 1000)
                  const totalThumbsWidth = thumbs.length * thumbWidth
                  const repeatCount = Math.max(1, Math.ceil(itemWidthPx / totalThumbsWidth))
                  const repeatedThumbs: string[] = []
                  for (let r = 0; r < repeatCount; r++) {
                    repeatedThumbs.push(...thumbs)
                  }
                  return repeatedThumbs.map((thumb, idx) => (
                    <img
                      key={idx}
                      src={thumb}
                      alt=""
                      className={styles.thumbnail}
                      draggable={false}
                    />
                  ))
                })()}
              </div>
              {hasTrim && (
                <div className={styles.videoOverlayText}>
                  <span className={styles.trimBadge}>
                    {video.trimStart.toFixed(1)}s / {video.trimEnd.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {images.filter((img) => img.isMainTrack).map((image) => {
        const leftPercent = getContentPosition(image.startTime)
        const widthPercent = totalDuration > 0 ? (image.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedImageId === image.id
        return (
          <div
            key={image.id}
            className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute', height: '100%' }}
            onClick={(e) => {
              e.stopPropagation()
              selectImage(isSelected ? null : image.id)
            }}
            onMouseDown={(e) => handleImageDragStart(image.id, 'move', e)}
          >
            <div
              className={styles.overlayHandleStart}
              onMouseDown={(e) => handleImageDragStart(image.id, 'start', e)}
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className={styles.overlayHandleEnd}
              onMouseDown={(e) => handleImageDragStart(image.id, 'end', e)}
              onClick={(e) => e.stopPropagation()}
            />
            {isSelected && (
              <button
                className={`${styles.replaceButton} ${replaceTargetId === image.id ? styles.active : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (replaceTargetId === image.id) {
                    setReplaceTargetId(null)
                  } else {
                    setReplaceTargetId(image.id)
                    replaceInputRef.current?.click()
                  }
                }}
                title={replaceTargetId === image.id ? 'Cancel replace' : 'Replace image source'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            )}
            <div className={styles.overlayBox}>
              <img src={image.url} alt={image.name} className={styles.overlayThumbnail} />
              <span className={styles.overlayName}>{image.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
