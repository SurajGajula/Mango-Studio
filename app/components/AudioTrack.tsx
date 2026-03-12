'use client'

import { useAudioStore } from '@/app/stores/audioStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './Timeline.module.css'

interface AudioTrackProps {
  totalDuration: number
  effectivePadding: number
  getContentPosition: (time: number) => number
  setIsAudioSelected: (selected: boolean | ((v: boolean) => boolean)) => void
  isAudioSelected: boolean
  handleAudioBodyDragStart: (audioId: string, e: React.MouseEvent) => void
  handleAudioTrimStart: (audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => void
  audioCanvasRef: React.RefObject<HTMLCanvasElement>
}

export default function AudioTrack({
  totalDuration,
  effectivePadding,
  getContentPosition,
  setIsAudioSelected,
  isAudioSelected,
  handleAudioBodyDragStart,
  handleAudioTrimStart,
  audioCanvasRef,
}: AudioTrackProps) {
  const audios = useManifestStore((state) => state.audios)
  const audioAnalysis = useAudioStore((state) => state.analysis)
  const isAnalyzing = useAudioStore((state) => state.isAnalyzing)
  const userMarks = useAudioStore((state) => state.userMarks)

  if (!audioAnalysis && !isAnalyzing) return null

  const audioItem = audios[0]
  const aTrimStart = audioItem?.trimStart ?? 0
  const aTrimEnd = audioItem?.trimEnd ?? 0
  const aOrigDur = audioItem?.originalDuration ?? audioAnalysis?.duration ?? 0
  const aStartTime = audioItem?.startTime ?? 0
  const aActiveDur = aOrigDur - aTrimStart - aTrimEnd
  const activeStartPct = getContentPosition(aStartTime)
  const activeEndPct = getContentPosition(Math.min(aStartTime + aActiveDur, totalDuration))

  return (
    <div
      className={styles.audioRow}
      onClick={(e) => { e.stopPropagation(); setIsAudioSelected((s) => !s) }}
    >
      <div
        className={styles.audioRowBackground}
        style={{
          left: `${activeStartPct}%`,
          width: `${Math.max(0, activeEndPct - activeStartPct)}%`,
          cursor: audioItem ? 'grab' : 'default',
        }}
        onMouseDown={audioItem ? (e) => handleAudioBodyDragStart(audioItem.id, e) : undefined}
      />
      {isAnalyzing && (
        <span className={styles.analyzingBadge}>Analyzing audio…</span>
      )}
      {audioAnalysis && (
        <>
          <canvas ref={audioCanvasRef} className={styles.audioCanvas} />
          {isAudioSelected && totalDuration > 0 && (
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
          {isAudioSelected && audioItem && (
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
