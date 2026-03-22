'use client'

import { memo, useMemo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'

interface EffectTrackProps {
  rowIndex: number
  getContentPosition: (time: number) => number
  totalDuration: number
  effectivePadding: number
  handleEffectDragStart: (effectId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => void
  onCloseTransitions?: () => void
  onOpenEffects?: () => void
}

const EffectTrackComponent = ({
  rowIndex,
  getContentPosition,
  totalDuration,
  effectivePadding,
  handleEffectDragStart,
  onCloseTransitions,
  onOpenEffects,
}: EffectTrackProps) => {
  const effects = useManifestStore((state) => state.effects)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const selectedEffectId = useSelectionStore((state) => state.selectedEffectId)
  const selectEffect = useSelectionStore((state) => state.selectEffect)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const sortedEffects = useMemo(() => {
    return [...effects.filter((e) => e.row === rowIndex)].sort((a, b) => a.startTime - b.startTime)
  }, [effects, rowIndex])

  if (sortedEffects.length === 0) return null

  return (
    <div className={styles.effectRow}>
      <div
        className={styles.effectRowBackground}
        style={{
          left: `${getContentPosition(0)}%`,
          width: `${(totalDuration / (totalDuration + effectivePadding * 2)) * 100}%`,
        }}
      />
      {sortedEffects.map((effect, idx) => {
        const leftPercent = getContentPosition(effect.startTime)
        const duration = effect.endTime - effect.startTime
        const widthPercent = totalDuration > 0 ? (duration / (totalDuration + effectivePadding * 2)) * 100 : 0
        const isSelected = selectedEffectId === effect.id
        
        return (
          <div
            key={effect.id}
            className={`${styles.effectItem} ${isSelected ? styles.selected : ''}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
            onClick={(e) => {
              e.stopPropagation()
              selectEffect(isSelected ? null : effect.id)
              if (!isSelected) {
                // Seek to slightly after startTime to ensure effect is active for the panel
                setPlaybackTime(effect.startTime + 0.001)
                onOpenEffects?.()
              }
            }}
            onMouseDown={(e) => handleEffectDragStart(effect.id, 'move', e)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              selectEffect(effect.id)
              setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                itemId: effect.id,
                itemType: 'effect',
              })
            }}
          >
            <div 
              className={styles.overlayHandleStart} 
              onMouseDown={(e) => {
                e.stopPropagation()
                handleEffectDragStart(effect.id, 'start', e)
              }} 
              onClick={(e) => e.stopPropagation()} 
            />
            <div 
              className={styles.overlayHandleEnd} 
              onMouseDown={(e) => {
                e.stopPropagation()
                handleEffectDragStart(effect.id, 'end', e)
              }} 
              onClick={(e) => e.stopPropagation()} 
            />
            <div className={styles.effectBox}>
              <svg 
                className={styles.effectIcon} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <span className={styles.effectName}>
                Effect #{idx + 1}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(EffectTrackComponent)
