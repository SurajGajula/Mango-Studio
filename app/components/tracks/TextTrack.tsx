'use client'

import { memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'

interface TextTrackProps {
  rowIndex: number
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  setSelectedTextId: (id: string | null) => void
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  handleTextDragStart: (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
}

const TextTrackComponent = ({
  rowIndex,
  getContentPosition,
  totalDuration,
  effectivePadding,
  setSelectedTextId,
  setSelectedVideoId,
  setSelectedImageId,
  handleTextDragStart,
}: TextTrackProps) => {
  const texts = useManifestStore((state) => state.texts)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const selectText = useSelectionStore((state) => state.selectText)

  return (
    <div className={styles.textRow}>
      <div
        className={styles.textRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {texts.filter((t) => t.row === rowIndex).map((text) => {
        const leftPercent = getContentPosition(text.startTime)
        const widthPercent = totalDuration > 0 ? (text.duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedTextId === text.id
        return (
          <div
            key={text.id}
            className={`${styles.overlayItem} ${styles.textItem} ${isSelected ? styles.selected : ''}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, position: 'absolute' }}
            onClick={(e) => {
              e.stopPropagation()
              selectText(isSelected ? null : text.id)
            }}
            onMouseDown={(e) => handleTextDragStart(text.id, 'move', e)}
          >
            <div className={styles.overlayHandleStart} onMouseDown={(e) => handleTextDragStart(text.id, 'start', e)} onClick={(e) => e.stopPropagation()} />
            <div className={styles.overlayHandleEnd} onMouseDown={(e) => handleTextDragStart(text.id, 'end', e)} onClick={(e) => e.stopPropagation()} />
            <div className={styles.overlayBox}>
              <span className={styles.overlayName}>{text.content || 'Text'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(TextTrackComponent)
