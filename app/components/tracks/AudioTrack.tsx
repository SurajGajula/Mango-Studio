'use client'

import { memo } from 'react'
import { useAudioStore } from '@/app/stores/audioStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './Timeline.module.css'

interface AudioTrackProps {
  totalDuration: number
  effectivePadding: number
  getContentPosition: (time: number) => number
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
  audioCanvasRef: React.RefObject<HTMLCanvasElement>
}

const AudioTrack = ({
  totalDuration,
  effectivePadding,
  getContentPosition,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
  audioCanvasRef,
}: AudioTrackProps) => {
  const audios = useManifestStore((state) => state.audios)
  const audioAnalysis = useAudioStore((state) => state.analysis)
  const isAnalyzing = useAudioStore((state) => state.isAnalyzing)
  const userMarks = useAudioStore((state) => state.userMarks)

  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectAudio = useSelectionStore((state) => state.selectAudio)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  if (!audioAnalysis && !isAnalyzing) return null

  const audioItem = audios.find((a) => !a.isOverlay)
  if (!audioItem) {
    if (isAnalyzing) {
      return (
        <div className={styles.audioRow}>
          <span className={styles.analyzingBadge}>Analyzing audio…</span>
        </div>
      )
    }
    return null
  }

  const aTrimStart = audioItem.trimStart
  const aTrimEnd = audioItem.trimEnd
  const aOrigDur = audioItem.originalDuration
  const aStartTime = audioItem.startTime
  const aEndTime = audioItem.endTime
  const activeStartPct = getContentPosition(aStartTime)
  const activeEndPct = getContentPosition(Math.min(aEndTime, totalDuration))
  const isSelected = selectedAudioId === audioItem.id

  return (
    <div
      className={styles.audioRow}
      onClick={(e) => {
        e.stopPropagation()
        selectAudio(isSelected ? null : audioItem.id)
      }}
    >
      <div
        className={styles.audioRowBackground}
        style={{
          left: `${activeStartPct}%`,
          width: `${Math.max(0, activeEndPct - activeStartPct)}%`,
          cursor: 'grab',
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
      />
      {isAnalyzing && (
        <span className={styles.analyzingBadge}>Analyzing audio…</span>
      )}
      {audioAnalysis && (
        <>
          <canvas ref={audioCanvasRef} className={styles.audioCanvas} />
          {isSelected && totalDuration > 0 && (
            <div
              className={styles.audioRowSelected}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${activeStartPct}%`,
                width: `${activeEndPct - activeStartPct}%`,
                pointerEvents: 'none',
              }}
            />
          )}
          {isSelected && (
            <>
              <div
                className={styles.audioTrimHandleStart}
                style={{ left: `${activeStartPct}%` }}
                onMouseDown={(e) => { e.stopPropagation(); handleAudioTrimStart(audioItem.id, 'start', e) }}
              />
              <div
                className={styles.audioTrimHandleEnd}
                style={{ left: `${activeEndPct}%` }}
                onMouseDown={(e) => { e.stopPropagation(); handleAudioTrimStart(audioItem.id, 'end', e) }}
              />
            </>
          )}
          {userMarks
            .filter((t) => t >= aTrimStart && t <= (aOrigDur - aTrimEnd))
            .map((t, i) => {
              const timelinePos = aStartTime + (t - aTrimStart)
              if (timelinePos > totalDuration) return null
              return (
                <div
                  key={`um-${i}`}
                  className={styles.userMarkMarker}
                  style={{ left: `${getContentPosition(timelinePos)}%` }}
                  title={`Mark at ${t.toFixed(2)}s`}
                />
              )
            })}
        </>
      )}
    </div>
  )
}

export default memo(AudioTrack)
