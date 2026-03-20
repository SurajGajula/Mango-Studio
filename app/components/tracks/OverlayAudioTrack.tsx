'use client'

import { memo, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'

interface OverlayAudioTrackProps {
  rowIndex: number
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
}

const OverlayAudioTrackComponent = ({
  rowIndex,
  getContentPosition,
  totalDuration,
  effectivePadding,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
}: OverlayAudioTrackProps) => {
  const audios = useManifestStore((state) => state.audios)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectAudio = useSelectionStore((state) => state.selectAudio)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const sortedAudios = useMemo(() => {
    return [...audios.filter((a) => a.isOverlay && a.row === rowIndex)].sort((a, b) => a.startTime - b.startTime)
  }, [audios, rowIndex])

  return (
    <div className={styles.overlayRow} style={{ height: '32px', minHeight: '32px' }}>
      <div
        className={styles.overlayRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {sortedAudios.map((audio, idx) => {
        const leftPercent = getContentPosition(audio.startTime)
        const activeDur = audio.endTime - audio.startTime
        const widthPercent = totalDuration > 0 ? (activeDur / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedAudioId === audio.id

        return (
          <div
            key={audio.id}
            className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
            style={{ 
              left: `${leftPercent}%`, 
              width: `${widthPercent}%`, 
              position: 'absolute',
              backgroundColor: '#1e3a5f',
              borderColor: '#3b82f6'
            }}
            onClick={(e) => {
              e.stopPropagation()
              selectAudio(isSelected ? null : audio.id)
            }}
            onMouseDown={(e) => handleAudioBodyDragStart(audio.id, e)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              selectAudio(audio.id)
              setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                itemId: audio.id,
                itemType: 'audio',
              })
            }}
          >
            <div 
              className={styles.overlayHandleStart} 
              onMouseDown={(e) => {
                e.stopPropagation()
                handleAudioTrimStart(audio.id, 'start', e)
              }} 
              onClick={(e) => e.stopPropagation()} 
            />
            <div 
              className={styles.overlayHandleEnd} 
              onMouseDown={(e) => {
                e.stopPropagation()
                handleAudioTrimStart(audio.id, 'end', e)
              }} 
              onClick={(e) => e.stopPropagation()} 
            />
            <div className={styles.overlayBox}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: '#60a5fa' }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <span className={styles.overlayName} style={{ color: '#bfdbfe' }}>Audio #{idx + 1}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(OverlayAudioTrackComponent)
