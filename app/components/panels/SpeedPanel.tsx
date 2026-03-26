'use client'

import { useState, useEffect } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './SpeedPanel.module.css'

interface Props {
  onClose: () => void
  itemId: string
}

interface SpeedPreset {
  id: string
  name: string
  desc: string
  start: number
  end: number
}

const PRESETS: SpeedPreset[] = [
  { id: 'standard', name: 'Standard', desc: 'Constant speed', start: 1, end: 1 },
  { id: 'fast-to-slow', name: 'Fast to Slow', desc: 'Starts fast, ends slow', start: 2, end: 0.5 },
  { id: 'slow to fast', name: 'Slow to Fast', desc: 'Starts slow, ends fast', start: 0.5, end: 2 },
  { id: 'half', name: 'Half Speed', desc: 'Constant 0.5x', start: 0.5, end: 0.5 },
  { id: 'double', name: 'Double Speed', desc: 'Constant 2.0x', start: 2, end: 2 },
  { id: 'custom', name: 'Custom', desc: 'Custom start and end', start: 1, end: 1 },
]

export default function SpeedPanel({ onClose, itemId }: Props) {
  const videos = useManifestStore((s) => s.videos)
  const audios = useManifestStore((s) => s.audios)
  const setItemPlaybackSpeed = useManifestStore((s) => s.setItemPlaybackSpeed)

  const speedStartSliderHistory = useSliderHistorySession()
  const speedEndSliderHistory = useSliderHistorySession()

  const video = videos.find((v) => v.id === itemId)
  const audio = audios.find((a) => a.id === itemId)
  const item = video || audio

  const [speedStart, setSpeedStart] = useState<number>(item?.speedStart ?? item?.playbackSpeed ?? 1)
  const [speedEnd, setSpeedEnd] = useState<number>(item?.speedEnd ?? item?.playbackSpeed ?? 1)
  const [speedEasing, setSpeedEasing] = useState<'linear' | 'ease'>(item?.speedEasing ?? 'linear')

  useEffect(() => {
    if (item) {
      setSpeedStart(item.speedStart ?? item.playbackSpeed ?? 1)
      setSpeedEnd(item.speedEnd ?? item.playbackSpeed ?? 1)
      setSpeedEasing(item.speedEasing ?? 'linear')
    }
  }, [item])

  if (!item) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Playback Speed</span>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.body}>
          <p className={styles.emptyState}>Select an item on the timeline to adjust speed.</p>
        </div>
      </div>
    )
  }

  const applySpeed = (start: number, end: number, easing?: 'linear' | 'ease') => {
    const avg = (start + end) / 2
    const finalEasing = easing ?? speedEasing
    // We use the updated setItemPlaybackSpeed logic which handles speedStart/speedEnd/duration/trim correctly
    setItemPlaybackSpeed(itemId, avg, start, end, finalEasing)
    
    setSpeedStart(start)
    setSpeedEnd(end)
    setSpeedEasing(finalEasing)
  }

  const handlePresetSelect = (preset: SpeedPreset) => {
    if (preset.id === 'custom') return
    applySpeed(preset.start, preset.end)
  }

  const handleManualChange = (type: 'start' | 'end', val: number) => {
    const newStart = type === 'start' ? val : speedStart
    const newEnd = type === 'end' ? val : speedEnd
    applySpeed(newStart, newEnd)
  }

  const toggleEasing = () => {
    const next = speedEasing === 'linear' ? 'ease' : 'linear'
    applySpeed(speedStart, speedEnd, next)
  }

  const activePreset = PRESETS.find(p => p.id !== 'custom' && p.start === speedStart && p.end === speedEnd)?.id || 'custom'

  const averageSpeed = (speedStart + speedEnd) / 2
  const sourcePlayed = video ? (video.duration ?? 0) * (video.playbackSpeed ?? 1) : audio ? (audio.endTime - audio.startTime) * (audio.playbackSpeed ?? 1) : 0
  const newTimelineDuration = sourcePlayed / (averageSpeed || 1)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Playback Speed</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        <p className={styles.sectionLabel}>Presets</p>
        <div className={styles.speedPresets}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`${styles.presetCard} ${activePreset === p.id ? styles.presetCardActive : ''}`}
              onClick={() => handlePresetSelect(p)}
            >
              <span className={styles.presetName}>{p.name}</span>
              <span className={styles.presetDesc}>{p.desc}</span>
            </button>
          ))}
        </div>

        <p className={styles.sectionLabel}>Vector Speed Controls</p>
        <div className={styles.controls}>
          <div className={styles.easingToggleRow}>
            <span className={styles.controlLabel}>Smooth Transition (Easing)</span>
            <button 
              className={`${styles.toggleButton} ${speedEasing === 'ease' ? styles.toggleActive : ''}`}
              onClick={toggleEasing}
            >
              {speedEasing === 'ease' ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <label className={styles.controlLabel}>Start Speed</label>
              <span className={styles.controlValue}>{speedStart.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="4.0"
              step="0.05"
              value={speedStart}
              className={styles.slider}
              onPointerDown={speedStartSliderHistory}
              onChange={(e) => handleManualChange('start', parseFloat(e.target.value))}
            />
          </div>

          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <label className={styles.controlLabel}>End Speed</label>
              <span className={styles.controlValue}>{speedEnd.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="4.0"
              step="0.05"
              value={speedEnd}
              className={styles.slider}
              onPointerDown={speedEndSliderHistory}
              onChange={(e) => handleManualChange('end', parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div className={styles.durationInfo}>
          <div className={styles.durationRow}>
            <span>Average Speed</span>
            <b>{averageSpeed.toFixed(2)}x</b>
          </div>
          <div className={styles.durationRow} style={{ marginTop: '8px' }}>
            <span>Timeline Duration</span>
            <b>{newTimelineDuration.toFixed(2)}s</b>
          </div>
        </div>
      </div>
    </div>
  )
}
