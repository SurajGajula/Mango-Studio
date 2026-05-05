'use client'

import { useState, useEffect } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { SidePanelLayout } from '@/app/components/ui/SidePanelLayout'
import layout from '@/app/components/ui/SidePanelLayout.module.css'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
  itemId: string
}

type SpeedEasing = 'linear' | 'ease'

interface SpeedRampPreset {
  id: 'slow-fast' | 'fast-slow'
  name: string
  desc: string
  start: number
  end: number
  easing: SpeedEasing
  icon: React.ReactNode
}

const RAMP_PRESETS: SpeedRampPreset[] = [
  {
    id: 'slow-fast',
    name: 'Slow → fast',
    desc: 'Starts slow, ends fast',
    start: 0.5,
    end: 2,
    easing: 'ease',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 16c5-8 10 0 16-8" />
        <path d="M20 8v6h-6" />
      </svg>
    ),
  },
  {
    id: 'fast-slow',
    name: 'Fast → slow',
    desc: 'Starts fast, ends slow',
    start: 2,
    end: 0.5,
    easing: 'ease',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8c6 8 11 0 16 8" />
        <path d="M20 16v-6h-6" />
      </svg>
    ),
  },
]

export default function SpeedPanel({ onClose, itemId }: Props) {
  const videos = useManifestStore((s) => s.videos)
  const audios = useManifestStore((s) => s.audios)
  const setItemPlaybackSpeed = useManifestStore((s) => s.setItemPlaybackSpeed)
  const setPendingVideoReplaceSpeed = useManifestStore((s) => s.setPendingVideoReplaceSpeed)
  const setVideoReplaceFilePickerRequest = useManifestStore((s) => s.setVideoReplaceFilePickerRequest)
  const selectVideo = useSelectionStore((s) => s.selectVideo)

  const speedSliderHistory = useSliderHistorySession()

  const video = videos.find((v) => v.id === itemId)
  const audio = audios.find((a) => a.id === itemId)
  const item = video || audio

  const [speedStart, setSpeedStart] = useState<number>(item?.speedStart ?? item?.playbackSpeed ?? 1)
  const [speedEnd, setSpeedEnd] = useState<number>(item?.speedEnd ?? item?.playbackSpeed ?? 1)
  const [speedEasing, setSpeedEasing] = useState<SpeedEasing>(item?.speedEasing ?? 'linear')

  useEffect(() => {
    if (item) {
      setSpeedStart(item.speedStart ?? item.playbackSpeed ?? 1)
      setSpeedEnd(item.speedEnd ?? item.playbackSpeed ?? 1)
      setSpeedEasing(item.speedEasing ?? 'linear')
    }
  }, [item])

  if (!item) {
    return (
      <SidePanelLayout title="Playback Speed" onClose={onClose}>
        <p className={layout.emptyState}>Select an item on the timeline to adjust speed.</p>
      </SidePanelLayout>
    )
  }

  const applySpeed = (start: number, end: number, easing?: SpeedEasing) => {
    const avg = (start + end) / 2
    const finalEasing = easing ?? speedEasing
    const ok = setItemPlaybackSpeed(itemId, avg, start, end, finalEasing)
    if (!ok) {
      if (video) {
        setPendingVideoReplaceSpeed({
          videoId: itemId,
          playbackSpeed: avg,
          speedStart: start,
          speedEnd: end,
          speedEasing: finalEasing,
        })
        selectVideo(itemId)
        setVideoReplaceFilePickerRequest({ videoId: itemId })
        setSpeedStart(start)
        setSpeedEnd(end)
        setSpeedEasing(finalEasing)
      }
      return
    }

    setSpeedStart(start)
    setSpeedEnd(end)
    setSpeedEasing(finalEasing)
  }

  const activeRampId: SpeedRampPreset['id'] | null =
    (speedStart === 0.5 && speedEnd === 2) ? 'slow-fast'
    : (speedStart === 2 && speedEnd === 0.5) ? 'fast-slow'
    : null

  const averageSpeed = (speedStart + speedEnd) / 2

  return (
    <SidePanelLayout title="Playback Speed" onClose={onClose}>
        <p className={layout.sectionLabel}>Speed Ramps</p>
        <div className={styles.optionList}>
          {RAMP_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`${styles.optionCard} ${activeRampId === p.id ? styles.optionCardActive : ''}`}
              onClick={() => applySpeed(p.start, p.end, p.easing)}
            >
              <span className={styles.optionIcon}>{p.icon}</span>
              <span className={styles.optionInfo}>
                <span className={styles.optionName}>{p.name}</span>
                <span className={styles.optionDesc}>{p.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.durationControl}>
          <div className={styles.durationHeader}>
            <label className={styles.durationLabel}>Speed</label>
            <span className={styles.durationValue}>{averageSpeed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="4.0"
            step="0.05"
            value={averageSpeed}
            className={styles.durationSlider}
            onPointerDown={speedSliderHistory}
            onInput={(e) => {
              const val = parseFloat((e.target as HTMLInputElement).value)
              applySpeed(val, val, 'linear')
            }}
          />
        </div>
    </SidePanelLayout>
  )
}
