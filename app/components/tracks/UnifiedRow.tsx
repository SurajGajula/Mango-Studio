'use client'

import { memo, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { AudioClass } from '@/app/models/AudioClass'
import styles from './Timeline.module.css'
import { audioMarkTimelinePositions } from '@/app/lib/audioMarkTimeline'

interface UnifiedRowProps {
  rowIndex: number
  showEmptyForDrag?: boolean
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  handleImageDragStart: (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleOverlayVideoDragStart: (videoId: string, e: React.MouseEvent) => void
  handleTrimStart: (videoId: string, handle: 'start' | 'end' | null, e: React.MouseEvent) => void
  handleTextDragStart: (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleEffectDragStart: (effectId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
  handleVideoDoubleClick: (videoId: string) => void
  onOpenEffects?: () => void
  onCloseTransitions?: () => void
}

const UnifiedRow = ({
  rowIndex,
  showEmptyForDrag = false,
  getContentPosition,
  totalDuration,
  effectivePadding,
  handleImageDragStart,
  handleOverlayVideoDragStart,
  handleTrimStart,
  handleTextDragStart,
  handleEffectDragStart,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
  handleVideoDoubleClick,
  onOpenEffects,
  onCloseTransitions,
}: UnifiedRowProps) => {
  const images = useManifestStore((state) => state.images)
  const videos = useManifestStore((state) => state.videos)
  const texts = useManifestStore((state) => state.texts)
  const effects = useManifestStore((state) => state.effects)
  const audios = useManifestStore((state) => state.audios)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const selectedEffectId = useSelectionStore((state) => state.selectedEffectId)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  
  const selectImage = useSelectionStore((state) => state.selectImage)
  const selectVideo = useSelectionStore((state) => state.selectVideo)
  const selectText = useSelectionStore((state) => state.selectText)
  const selectEffect = useSelectionStore((state) => state.selectEffect)
  const selectAudio = useSelectionStore((state) => state.selectAudio)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const items = useMemo(() => {
    const rowImages = images.filter((img) => img.row === rowIndex && !img.isMainTrack).map(img => ({ type: 'image' as const, item: img, id: img.id, startTime: img.startTime, duration: img.endTime - img.startTime }))
    const rowVideos = videos.filter((v) => v.row === rowIndex && v.isOverlay).map(v => ({ type: 'video' as const, item: v, id: v.id, startTime: v.timestamp, duration: v.duration ?? 0 }))
    const rowTexts = texts.filter((t) => t.row === rowIndex).map(t => ({ type: 'text' as const, item: t, id: t.id, startTime: t.startTime, duration: t.endTime - t.startTime }))
    const rowEffects = effects.filter((e) => e.row === rowIndex).map(e => ({ type: 'effect' as const, item: e, id: e.id, startTime: e.startTime, duration: e.endTime - e.startTime }))
    const rowAudios = audios.filter((a) => a.row === rowIndex && a.isOverlay).map(a => ({ type: 'audio' as const, item: a, id: a.id, startTime: a.startTime, duration: (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1) }))
    
    return [...rowImages, ...rowVideos, ...rowTexts, ...rowEffects, ...rowAudios].sort((a, b) => a.startTime - b.startTime)
  }, [images, videos, texts, effects, audios, rowIndex])

  if (items.length === 0 && !showEmptyForDrag) return null

  return (
    <div className={styles.overlayRow} data-row-index={rowIndex}>
      <div
        className={styles.overlayRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {items.length === 0 ? null : items.map((entry) => {
        const { type, item, id, startTime, duration } = entry
        const leftPercent = getContentPosition(startTime)
        const widthPercent = totalDuration > 0 ? (duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        
        if (type === 'image') {
          const isSelected = selectedImageId === id
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              onClick={(e) => { e.stopPropagation(); selectImage(isSelected ? null : id) }}
              onMouseDown={(e) => handleImageDragStart(id, 'move', e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectImage(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'image' })
              }}
            >
              <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleImageDragStart(id, 'start', e) }} />
              <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleImageDragStart(id, 'end', e) }} />
              <div className={styles.overlayBox}>
                <img src={(item as any).url} className={styles.overlayThumbnail} alt="" draggable={false} />
                <span className={styles.overlayName}>Image</span>
              </div>
            </div>
          )
        }
        if (type === 'video') {
          const isSelected = selectedVideoId === id
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              onClick={(e) => { e.stopPropagation(); selectVideo(isSelected ? null : id) }}
              onDoubleClick={(e) => { e.stopPropagation(); handleVideoDoubleClick(id) }}
              onMouseDown={(e) => handleOverlayVideoDragStart(id, e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectVideo(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'video' })
              }}
            >
              <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(id, 'start', e) }} />
              <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(id, 'end', e) }} />
              <div className={styles.overlayBox}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                <span className={styles.overlayName}>Video</span>
              </div>
            </div>
          )
        }
        if (type === 'text') {
          const isSelected = selectedTextId === id
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${styles.textItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              onClick={(e) => { e.stopPropagation(); selectText(isSelected ? null : id) }}
              onMouseDown={(e) => handleTextDragStart(id, 'move', e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectText(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'text' })
              }}
            >
              <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleTextDragStart(id, 'start', e) }} />
              <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleTextDragStart(id, 'end', e) }} />
              <div className={styles.overlayBox}><span className={styles.overlayName}>Text</span></div>
            </div>
          )
        }
        if (type === 'effect') {
          const isSelected = selectedEffectId === id
          return (
            <div
              key={id}
              className={`${styles.effectItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              onClick={(e) => {
                e.stopPropagation(); selectEffect(isSelected ? null : id)
                if (!isSelected) { setPlaybackTime(startTime + 0.001); onOpenEffects?.() }
              }}
              onMouseDown={(e) => handleEffectDragStart(id, 'move', e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectEffect(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'effect' })
              }}
            >
              <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleEffectDragStart(id, 'start', e) }} />
              <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleEffectDragStart(id, 'end', e) }} />
              <div className={styles.effectBox}>
                <svg className={styles.effectIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                <span className={styles.effectName}>Effect</span>
              </div>
            </div>
          )
        }
        if (type === 'audio') {
          const isSelected = selectedAudioId === id
          const audioItem = item as AudioClass
          const markPositions = audioMarkTimelinePositions(audioItem, totalDuration)
          const segW = Math.max(1e-6, widthPercent)
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              onClick={(e) => { e.stopPropagation(); selectAudio(isSelected ? null : id) }}
              onMouseDown={(e) => handleAudioBodyDragStart(id, e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectAudio(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'audio' })
              }}
            >
              {isSelected && (
                <>
                  <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleAudioTrimStart(id, 'start', e) }} />
                  <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleAudioTrimStart(id, 'end', e) }} />
                </>
              )}
              <div className={styles.overlayBox}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                <span className={styles.overlayName}>Audio</span>
              </div>
              {markPositions.map((timelinePos, i) => (
                <div
                  key={`${id}-um-${i}`}
                  className={styles.userMarkMarker}
                  style={{
                    left: `${((getContentPosition(timelinePos) - leftPercent) / segW) * 100}%`,
                  }}
                  title={`Mark at ${timelinePos.toFixed(2)}s`}
                />
              ))}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

export default memo(UnifiedRow)
