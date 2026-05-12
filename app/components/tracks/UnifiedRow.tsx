'use client'

import { memo, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { AudioClass } from '@/app/models/AudioClass'
import { ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import styles from './Timeline.module.css'
import { audioMarkTimelineEntries } from '@/app/lib/audioMarkTimeline'
import { keyframeTimelineEntries } from '@/app/lib/mediaKeyframeTimeline'
import { buildVideoStripThumbnails } from '@/app/lib/timelineVideoStrip'
import { buildManifestNumberById, canEditTransitionBetween, toVisualTrackItem } from '@/app/lib/timelineVisualTrack'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import TransitionEditButton from './TransitionEditButton'
import type { TimelineSelectionItem } from '@/app/hooks/timeline/useTimelineDrag'

interface UnifiedRowProps {
  rowIndex: number
  showEmptyForDrag?: boolean
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  handleImageDragStart: (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleVideoDragStart: (videoId: string, e: React.MouseEvent) => void
  handleTrimStart: (videoId: string, handle: 'start' | 'end' | null, e: React.MouseEvent) => void
  handleTextDragStart: (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleEffectDragStart: (effectId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
  handleVideoDoubleClick: (videoId: string) => void
  videoThumbnails: Map<string, Map<number, string>>
  scrollContainerRef: React.RefObject<HTMLDivElement>
  timelineInnerWidthPx: number
  onOpenTransitions?: (id: string) => void
  onOpenEffects?: () => void
  multiSelectedItems: TimelineSelectionItem[]
  onSelectionToggle: (item: TimelineSelectionItem, additive: boolean) => void
}

const UnifiedRow = ({
  rowIndex,
  showEmptyForDrag = false,
  getContentPosition,
  totalDuration,
  effectivePadding,
  handleImageDragStart,
  handleVideoDragStart,
  handleTrimStart,
  handleTextDragStart,
  handleEffectDragStart,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
  handleVideoDoubleClick,
  videoThumbnails,
  scrollContainerRef,
  timelineInnerWidthPx,
  onOpenTransitions,
  onOpenEffects,
  multiSelectedItems,
  onSelectionToggle,
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
  const selectedAudioMarkId = useSelectionStore((state) => state.selectedAudioMarkId)
  const selectedKeyframeId = useSelectionStore((state) => state.selectedKeyframeId)
  
  const selectImage = useSelectionStore((state) => state.selectImage)
  const selectVideo = useSelectionStore((state) => state.selectVideo)
  const selectText = useSelectionStore((state) => state.selectText)
  const selectEffect = useSelectionStore((state) => state.selectEffect)
  const selectAudio = useSelectionStore((state) => state.selectAudio)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)
  const selectedSet = useMemo(
    () => new Set(multiSelectedItems.map((entry) => `${entry.type}:${entry.id}`)),
    [multiSelectedItems]
  )

  const items = useMemo(() => {
    const rowImages = images.filter((img) => img.row === rowIndex).map(img => ({ type: 'image' as const, item: img, id: img.id, startTime: img.startTime, duration: img.endTime - img.startTime }))
    const rowVideos = videos.filter((v) => v.row === rowIndex).map(v => ({ type: 'video' as const, item: v, id: v.id, startTime: v.timestamp, duration: manifestVideoTimelineSpanSeconds(v) }))
    const rowTexts = texts.filter((t) => t.row === rowIndex).map(t => ({ type: 'text' as const, item: t, id: t.id, startTime: t.startTime, duration: t.endTime - t.startTime }))
    const rowEffects = effects.filter((e) => e.row === rowIndex).map(e => ({ type: 'effect' as const, item: e, id: e.id, startTime: e.startTime, duration: e.endTime - e.startTime }))
    const rowAudios = audios.filter((a) => a.row === rowIndex).map(a => ({ type: 'audio' as const, item: a, id: a.id, startTime: a.startTime, duration: (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1) }))
    
    return [...rowImages, ...rowVideos, ...rowTexts, ...rowEffects, ...rowAudios].sort((a, b) => a.startTime - b.startTime)
  }, [images, videos, texts, effects, audios, rowIndex])

  const imageManifestNumberById = useMemo(
    () => buildManifestNumberById(images, (img) => img.id, (img) => img.startTime),
    [images]
  )
  const videoManifestNumberById = useMemo(
    () => buildManifestNumberById(videos, (video) => video.id, (video) => video.timestamp),
    [videos]
  )
  const textManifestNumberById = useMemo(
    () => buildManifestNumberById(texts, (t) => t.id, (t) => t.startTime),
    [texts]
  )
  const audioManifestNumberById = useMemo(
    () => buildManifestNumberById(audios, (a) => a.id, (a) => a.startTime),
    [audios]
  )

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
      {items.length === 0 ? null : items.map((entry, idx) => {
        const { type, item, id, startTime, duration } = entry
        const leftPercent = getContentPosition(startTime)
        const widthPercent = totalDuration > 0 ? (duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const previousVisualEntry = (() => {
          for (let i = idx - 1; i >= 0; i -= 1) {
            const candidate = items[i]
            if (candidate.type === 'video' || candidate.type === 'image') return candidate
          }
          return null
        })()
        const currentVisualItem =
          type === 'video' ? toVisualTrackItem(item as VideoClass, 'video') : type === 'image' ? toVisualTrackItem(item as ImageClass, 'image') : null
        const previousVisualItem =
          previousVisualEntry && (previousVisualEntry.type === 'video' || previousVisualEntry.type === 'image')
            ? toVisualTrackItem(
                previousVisualEntry.item as VideoClass | ImageClass,
                previousVisualEntry.type
              )
            : null
        const showTransitionButton =
          currentVisualItem !== null && canEditTransitionBetween(previousVisualItem, currentVisualItem)
        
        if (type === 'image') {
          const isSelected = selectedImageId === id || selectedSet.has(`image:${id}`)
          const imgItem = item as ImageClass
          const imageNumber = imageManifestNumberById.get(id) ?? 1
          const imageLabel = `Image #${imageNumber}`
          const activeEndPct = getContentPosition(startTime + duration)
          const segWImg = Math.max(1e-6, activeEndPct - leftPercent)
          const kfImg = keyframeTimelineEntries(startTime, duration, imgItem.keyframes ?? [], totalDuration)
          return (
            <div key={id}>
              {showTransitionButton && (
                <TransitionEditButton
                  leftPercent={leftPercent}
                  hasTransition={imgItem.transition !== 'none'}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectImage(id)
                    onOpenTransitions?.(id)
                  }}
                />
              )}
              <div
                className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
                data-timeline-selectable="true"
                data-timeline-item-id={id}
                data-timeline-item-type="image"
                onClick={(e) => {
                  e.stopPropagation()
                  const additive = e.metaKey || e.ctrlKey
                  if (!additive) selectImage(id, null)
                  onSelectionToggle({ id, type: 'image' }, additive)
                }}
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
                  <span className={styles.overlayName}>{imageLabel}</span>
                </div>
                {kfImg.map(({ id: kfId, timelinePos }) => (
                  <div
                    key={kfId}
                    className={`${styles.keyframeMarker} ${selectedImageId === id && selectedKeyframeId === kfId ? styles.keyframeMarkerSelected : ''}`}
                    style={{
                      left: `${((getContentPosition(timelinePos) - leftPercent) / segWImg) * 100}%`,
                    }}
                    title={`Keyframe at ${timelinePos.toFixed(2)}s`}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectImage(id, kfId)
                      setPlaybackTime(timelinePos)
                    }}
                  />
                ))}
              </div>
            </div>
          )
        }
        if (type === 'video') {
          const isSelected = selectedVideoId === id || selectedSet.has(`video:${id}`)
          const vidItem = item as VideoClass
          const activeEndPctV = getContentPosition(startTime + duration)
          const segWVid = Math.max(1e-6, activeEndPctV - leftPercent)
          const kfVid = keyframeTimelineEntries(startTime, duration, vidItem.keyframes ?? [], totalDuration)
          return (
            <div key={id}>
              {showTransitionButton && (
                <TransitionEditButton
                  leftPercent={leftPercent}
                  hasTransition={vidItem.transition !== 'none'}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectVideo(id)
                    onOpenTransitions?.(id)
                  }}
                />
              )}
              <div
                className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
                data-timeline-selectable="true"
                data-timeline-item-id={id}
                data-timeline-item-type="video"
                onClick={(e) => {
                  e.stopPropagation()
                  const additive = e.metaKey || e.ctrlKey
                  if (!additive) selectVideo(id, null)
                  onSelectionToggle({ id, type: 'video' }, additive)
                }}
                onDoubleClick={(e) => { e.stopPropagation(); handleVideoDoubleClick(id) }}
                onMouseDown={(e) => handleVideoDragStart(id, e)}
                onContextMenu={(e) => {
                  e.preventDefault(); e.stopPropagation(); selectVideo(id)
                  setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'video' })
                }}
              >
                <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(id, 'start', e) }} />
                <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(id, 'end', e) }} />
                <div className={styles.videoBox}>
                  <div className={styles.thumbnailStrip}>
                    {(() => {
                      const repeatedThumbs = buildVideoStripThumbnails({
                        video: vidItem,
                        videoThumbnails,
                        widthPercent,
                        timelineInnerWidthPx,
                        fallbackViewportWidthPx: scrollContainerRef.current?.clientWidth ?? 800,
                        totalDuration,
                      })
                      if (repeatedThumbs.length === 0) return null
                      return repeatedThumbs.map((thumb, tIdx) => (
                        <img key={`${id}-thumb-${tIdx}`} src={thumb} alt="" className={styles.thumbnail} draggable={false} />
                      ))
                    })()}
                  </div>
                  <div className={styles.videoOverlayText}>
                    <span className={styles.overlayName}>Video #{videoManifestNumberById.get(id)}</span>
                  </div>
                </div>
                {kfVid.map(({ id: kfId, timelinePos }) => (
                  <div
                    key={kfId}
                    className={`${styles.keyframeMarker} ${selectedVideoId === id && selectedKeyframeId === kfId ? styles.keyframeMarkerSelected : ''}`}
                    style={{
                      left: `${((getContentPosition(timelinePos) - leftPercent) / segWVid) * 100}%`,
                    }}
                    title={`Keyframe at ${timelinePos.toFixed(2)}s`}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectVideo(id, kfId)
                      setPlaybackTime(timelinePos)
                    }}
                  />
                ))}
              </div>
            </div>
          )
        }
        if (type === 'text') {
          const isSelected = selectedTextId === id || selectedSet.has(`text:${id}`)
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${styles.textItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              data-timeline-selectable="true"
              data-timeline-item-id={id}
              data-timeline-item-type="text"
              onClick={(e) => {
                e.stopPropagation()
                const additive = e.metaKey || e.ctrlKey
                if (!additive) selectText(id)
                onSelectionToggle({ id, type: 'text' }, additive)
              }}
              onMouseDown={(e) => handleTextDragStart(id, 'move', e)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation(); selectText(id)
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id, itemType: 'text' })
              }}
            >
              <div className={styles.overlayHandleStart} onMouseDown={(e) => { e.stopPropagation(); handleTextDragStart(id, 'start', e) }} />
              <div className={styles.overlayHandleEnd} onMouseDown={(e) => { e.stopPropagation(); handleTextDragStart(id, 'end', e) }} />
              <div className={styles.overlayBox}><span className={styles.overlayName}>Text #{textManifestNumberById.get(id)}</span></div>
            </div>
          )
        }
        if (type === 'effect') {
          const isSelected = selectedEffectId === id || selectedSet.has(`effect:${id}`)
          return (
            <div
              key={id}
              className={`${styles.effectItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              data-timeline-selectable="true"
              data-timeline-item-id={id}
              data-timeline-item-type="effect"
              onClick={(e) => {
                e.stopPropagation()
                const additive = e.metaKey || e.ctrlKey
                if (!additive) selectEffect(id)
                onSelectionToggle({ id, type: 'effect' }, additive)
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
          const isSelected = selectedAudioId === id || selectedSet.has(`audio:${id}`)
          const audioItem = item as AudioClass
          const markEntries = audioMarkTimelineEntries(audioItem, totalDuration)
          const activeEndPctA = getContentPosition(startTime + duration)
          const segW = Math.max(1e-6, activeEndPctA - leftPercent)
          return (
            <div
              key={id}
              className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
              data-timeline-selectable="true"
              data-timeline-item-id={id}
              data-timeline-item-type="audio"
              onClick={(e) => {
                e.stopPropagation()
                const additive = e.metaKey || e.ctrlKey
                if (!additive) selectAudio(id, null)
                onSelectionToggle({ id, type: 'audio' }, additive)
              }}
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
                <span className={styles.overlayName}>Audio #{audioManifestNumberById.get(id)}</span>
              </div>
              {markEntries.map(({ id: markId, timelinePos }) => (
                <div
                  key={markId}
                  className={`${styles.userMarkMarker} ${selectedAudioId === id && selectedAudioMarkId === markId ? styles.userMarkMarkerSelected : ''}`}
                  style={{
                    left: `${((getContentPosition(timelinePos) - leftPercent) / segW) * 100}%`,
                  }}
                  title={`Mark at ${timelinePos.toFixed(2)}s`}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectAudio(id, markId)
                    setPlaybackTime(timelinePos)
                  }}
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
