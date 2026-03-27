'use client'

import { memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'
import { audioMarkTimelinePositions } from '@/app/lib/audioMarkTimeline'

interface AudioTrackProps {
  totalDuration: number
  effectivePadding: number
  getContentPosition: (time: number) => number
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
}

const AudioTrack = ({
  totalDuration,
  effectivePadding,
  getContentPosition,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
}: AudioTrackProps) => {
  const audios = useManifestStore((state) => state.audios)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectAudio = useSelectionStore((state) => state.selectAudio)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const mainAudios = audios.filter((a) => !a.isOverlay || (a.row === 0 && a.isOverlay))
  if (mainAudios.length === 0) return null

  return (
    <div className={styles.audioRow} data-row-index={-1}>
      <div
        className={styles.overlayRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {mainAudios.map((audioItem) => {
        const aStartTime = audioItem.startTime
        const aEndTime = audioItem.endTime
        const activeStartPct = getContentPosition(aStartTime)
        const activeEndPct = getContentPosition(aEndTime)
        const isSelected = selectedAudioId === audioItem.id
        const markPositions = audioMarkTimelinePositions(audioItem, totalDuration)
        const segW = Math.max(1e-6, activeEndPct - activeStartPct)

        return (
          <div
            key={audioItem.id}
            className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
            style={{
              left: `${activeStartPct}%`,
              width: `${Math.max(0, activeEndPct - activeStartPct)}%`,
              position: 'absolute',
            }}
            onClick={(e) => {
              e.stopPropagation()
              selectAudio(isSelected ? null : audioItem.id)
            }}
            onMouseDown={(e) => handleAudioBodyDragStart(audioItem.id, e)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              selectAudio(audioItem.id)
              setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                itemId: audioItem.id,
                itemType: 'audio',
              })
            }}
          >
            {isSelected && (
              <>
                <div
                  className={styles.overlayHandleStart}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleAudioTrimStart(audioItem.id, 'start', e)
                  }}
                />
                <div
                  className={styles.overlayHandleEnd}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleAudioTrimStart(audioItem.id, 'end', e)
                  }}
                />
              </>
            )}
            <div className={styles.overlayBox}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <span className={styles.overlayName}>Audio</span>
            </div>
            {markPositions.map((timelinePos, i) => (
              <div
                key={`${audioItem.id}-um-${i}`}
                className={styles.userMarkMarker}
                style={{
                  left: `${((getContentPosition(timelinePos) - activeStartPct) / segW) * 100}%`,
                }}
                title={`Mark at ${timelinePos.toFixed(2)}s`}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default memo(AudioTrack)
