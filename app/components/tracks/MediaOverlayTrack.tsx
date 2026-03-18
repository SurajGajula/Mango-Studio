'use client'

import { memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'

interface MediaOverlayTrackProps {
  rowIndex: number
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  setSelectedImageId: (id: string | null) => void
  setSelectedVideoId: (id: string | null) => void
  handleImageDragStart: (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleOverlayVideoDragStart: (videoId: string, e: React.MouseEvent) => void
  handleTrimStart: (videoId: string, handle: 'start' | 'end' | null, e: React.MouseEvent) => void
  handleVideoDoubleClick: (videoId: string) => void
  replaceTargetId: string | null
  setReplaceTargetId: (id: string | null) => void
  replaceInputRef: React.RefObject<HTMLInputElement>
  onCloseTransitions?: () => void
}

const MediaOverlayTrackComponent = ({
  rowIndex,
  getContentPosition,
  totalDuration,
  effectivePadding,
  setSelectedImageId,
  setSelectedVideoId,
  handleImageDragStart,
  handleOverlayVideoDragStart,
  handleTrimStart,
  handleVideoDoubleClick,
  replaceTargetId,
  setReplaceTargetId,
  replaceInputRef,
  onCloseTransitions,
}: MediaOverlayTrackProps) => {
  const images = useManifestStore((state) => state.images)
  const videos = useManifestStore((state) => state.videos)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectImage = useSelectionStore((state) => state.selectImage)
  const selectVideo = useSelectionStore((state) => state.selectVideo)

  return (
    <div className={styles.overlayRow}>
      <div
        className={styles.overlayRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {images.filter((img) => img.row === rowIndex).map((image) => {
        const leftPercent = getContentPosition(image.startTime)
        const duration = image.endTime - image.startTime
        const widthPercent = totalDuration > 0 ? (duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedImageId === image.id
        return (
          <div
            key={image.id}
            className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
            onClick={(e) => {
              e.stopPropagation()
              selectImage(isSelected ? null : image.id)
              onCloseTransitions?.()
            }}
            onMouseDown={(e) => handleImageDragStart(image.id, 'move', e)}
          >
            <div className={styles.overlayHandleStart} onMouseDown={(e) => handleImageDragStart(image.id, 'start', e)} onClick={(e) => e.stopPropagation()} />
            <div className={styles.overlayHandleEnd} onMouseDown={(e) => handleImageDragStart(image.id, 'end', e)} onClick={(e) => e.stopPropagation()} />
            {isSelected && (
              <button
                className={`${styles.replaceButton} ${replaceTargetId === image.id ? styles.active : ''}`}
                onClick={(e) => { e.stopPropagation(); if (replaceTargetId === image.id) { setReplaceTargetId(null) } else { setReplaceTargetId(image.id); replaceInputRef.current?.click() } }}
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
      {videos.filter((v) => v.row === rowIndex).map((video) => {
        const leftPercent = getContentPosition(video.timestamp)
        const widthPercent = totalDuration > 0 && video.duration ? (video.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedVideoId === video.id
        return (
          <div
            key={video.id}
            className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
            onClick={(e) => {
              e.stopPropagation()
              selectVideo(isSelected ? null : video.id)
              onCloseTransitions?.()
            }}
            onDoubleClick={(e) => { e.stopPropagation(); handleVideoDoubleClick(video.id) }}
            onMouseDown={(e) => handleOverlayVideoDragStart(video.id, e)}
          >
            <div className={styles.overlayHandleStart} onMouseDown={(e) => handleTrimStart(video.id, 'start', e)} onClick={(e) => e.stopPropagation()} />
            <div className={styles.overlayHandleEnd} onMouseDown={(e) => handleTrimStart(video.id, 'end', e)} onClick={(e) => e.stopPropagation()} />
            {isSelected && (
              <button
                className={`${styles.replaceButton} ${replaceTargetId === video.id ? styles.active : ''}`}
                onClick={(e) => { e.stopPropagation(); if (replaceTargetId === video.id) { setReplaceTargetId(null) } else { setReplaceTargetId(video.id); replaceInputRef.current?.click() } }}
                title={replaceTargetId === video.id ? 'Cancel replace' : 'Replace video source'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            )}
            <div className={styles.overlayBox}>
              <button
                className={styles.muteButton}
                onClick={(e) => { e.stopPropagation(); updateVideo(video.id, { muted: !video.muted }) }}
                title={video.muted ? 'Unmute video audio' : 'Mute video audio'}
              >
                {video.muted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                )}
              </button>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><polygon points="5,3 19,12 5,21" /></svg>
              <span className={styles.overlayName}>{video.title}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(MediaOverlayTrackComponent)
