'use client'

import { useEffect, useState } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './SpeedPanel.module.css'

interface Props {
  onClose: () => void
  itemId: string
}

interface PitchPreset {
  id: string
  name: string
  desc: string
  value: number
}

const PRESETS: PitchPreset[] = [
  { id: 'deep', name: 'Deep', desc: 'Lower and heavier', value: 0.8 },
  { id: 'deeper', name: 'Deeper', desc: 'Strong deep voice', value: 0.65 },
  { id: 'normal', name: 'Normal', desc: 'Original pitch', value: 1.0 },
  { id: 'bright', name: 'Bright', desc: 'Higher tone', value: 1.2 },
  { id: 'chipmunk', name: 'Very High', desc: 'Very high pitch', value: 1.4 },
]

export default function PitchPanel({ onClose, itemId }: Props) {
  const audios = useManifestStore((s) => s.audios)
  const updateAudio = useManifestStore((s) => s.updateAudio)
  const pitchSliderHistory = useSliderHistorySession()

  const audio = audios.find((a) => a.id === itemId)
  const [pitch, setPitch] = useState<number>(audio?.pitch ?? 1)

  useEffect(() => {
    if (audio) {
      setPitch(audio.pitch ?? 1)
    }
  }, [audio])

  if (!audio) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Pitch</span>
          <button className={styles.closeButton} onClick={onClose}>x</button>
        </div>
        <div className={styles.body}>
          <p className={styles.emptyState}>Select an audio item to adjust pitch.</p>
        </div>
      </div>
    )
  }

  const applyPitch = (value: number) => {
    updateAudio(itemId, { pitch: value })
    setPitch(value)
  }

  const activePreset = PRESETS.find((p) => Math.abs(p.value - pitch) < 0.001)?.id ?? ''

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Pitch</span>
        <button className={styles.closeButton} onClick={onClose}>x</button>
      </div>
      <div className={styles.body}>
        <p className={styles.sectionLabel}>Presets</p>
        <div className={styles.speedPresets}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`${styles.presetCard} ${activePreset === p.id ? styles.presetCardActive : ''}`}
              onClick={() => applyPitch(p.value)}
            >
              <span className={styles.presetName}>{p.name}</span>
              <span className={styles.presetDesc}>{p.desc}</span>
            </button>
          ))}
        </div>

        <p className={styles.sectionLabel}>Manual Control</p>
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <label className={styles.controlLabel}>Pitch Shift</label>
              <span className={styles.controlValue}>{pitch.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              value={pitch}
              className={styles.slider}
              onPointerDown={pitchSliderHistory}
              onChange={(e) => applyPitch(parseFloat(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
