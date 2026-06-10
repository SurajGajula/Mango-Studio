'use client'

import { useMemo } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { EffectClass, type EffectType } from '@/app/models/EffectClass'
import { generateId } from '@/app/lib/idUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { SidePanelLayout } from '@/app/components/ui/SidePanelLayout'
import layout from '@/app/components/ui/SidePanelLayout.module.css'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
}

const EFFECT_OPTIONS: { value: EffectType; label: string; icon: React.ReactNode }[] = [
  {
    value: 'crt-dither',
    label: 'CRT Dither',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="2" y1="8" x2="22" y2="8" />
        <line x1="2" y1="13" x2="22" y2="13" />
        <path d="M8 21l4-4 4 4" />
      </svg>
    ),
  },
  {
    value: 'flashing-black-vignette',
    label: 'Vignette',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" opacity="0.5" />
        <circle cx="12" cy="12" r="2" opacity="0.2" />
      </svg>
    ),
  },
  {
    value: 'black-and-white',
    label: 'Black & White',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    ),
  },
  {
    value: 'vivid-sharp',
    label: 'Vivid Sharp',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    value: 'pixel-glitch-scan',
    label: 'Pixel Glitch Scan',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h10M4 18h16" />
        <rect x="14" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    value: 'grainy',
    label: 'Grainy',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="11" cy="4" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="17" cy="7" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="8" cy="12" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="11" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="6" cy="17" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="13" cy="18" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="19" cy="15" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
]

export default function EffectsPanel({ onClose }: Props) {
  const effects = useManifestStore((s) => s.effects)
  const addEffect = useManifestStore((s) => s.addEffect)
  const updateEffect = useManifestStore((s) => s.updateEffect)
  const playbackTime = useManifestStore((s) => s.playbackTime)
  const selectedEffectId = useSelectionStore((s) => s.selectedEffectId)

  // Prioritize selected effect if it's active at the current playback time
  const activeEffect = useMemo(() => {
    if (selectedEffectId) {
      const selected = effects.find(e => e.id === selectedEffectId)
      if (selected && playbackTime >= selected.startTime && playbackTime < selected.endTime) {
        return selected
      }
    }
    return effects.find(e => playbackTime >= e.startTime && playbackTime < e.endTime) ?? null
  }, [effects, selectedEffectId, playbackTime])

  const activeType: EffectType | null = activeEffect?.type ?? null

  const intensitySliderHistory = useSliderHistorySession()
  const flashSpeedSliderHistory = useSliderHistorySession()

  const handleSelect = (value: EffectType) => {
    const start = playbackTime
    const duration = 5
    const end = start + duration
    const row = findFreeVisualOverlayRow(start, end)

    addEffect(new EffectClass(
      generateId('effect'),
      value,
      start,
      end,
      row,
      value === 'black-and-white' ? 1 : 0.5
    ))
  }

  const handleIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeEffect) {
      const newIntensity = parseFloat(e.target.value)
      updateEffect(activeEffect.id, { intensity: newIntensity })
    }
  }

  const handleFlashSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeEffect) {
      updateEffect(activeEffect.id, { flashSpeed: parseFloat(e.target.value) })
    }
  }

  return (
    <SidePanelLayout title="Effects" onClose={onClose}>
        <p className={layout.sectionLabel}>Video Effect</p>
        <div className={styles.optionListCompact}>
          {EFFECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.optionCard} ${activeType === opt.value ? styles.optionCardActive : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className={styles.optionIcon}>{opt.icon}</span>
              <span className={styles.optionInfo}>
                <span className={styles.optionName}>{opt.label}</span>
              </span>
            </button>
          ))}
        </div>

        {activeEffect?.type === 'flashing-black-vignette' && (
          <>
            <div className={styles.durationControl} style={{ marginTop: '2rem' }}>
              <div className={styles.durationHeader}>
                <span className={styles.durationLabel}>Vignette intensity</span>
                <span className={styles.durationValue}>{((activeEffect.intensity ?? 0.5) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={activeEffect.intensity ?? 0.5}
                onPointerDown={intensitySliderHistory}
                onChange={handleIntensityChange}
                className={styles.durationSlider}
              />
            </div>
            <div className={styles.durationControl} style={{ marginTop: '1rem' }}>
              <div className={styles.durationHeader}>
                <span className={styles.durationLabel}>Flash speed</span>
                <span className={styles.durationValue}>{((activeEffect.flashSpeed ?? 1) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={activeEffect.flashSpeed ?? 1}
                onPointerDown={flashSpeedSliderHistory}
                onChange={handleFlashSpeedChange}
                className={styles.durationSlider}
              />
            </div>
          </>
        )}

        {(activeEffect?.type === 'black-and-white' ||
          activeEffect?.type === 'vivid-sharp' ||
          activeEffect?.type === 'pixel-glitch-scan' ||
          activeEffect?.type === 'grainy') && (
          <div className={styles.durationControl} style={{ marginTop: '2rem' }}>
            <div className={styles.durationHeader}>
              <span className={styles.durationLabel}>
                {activeEffect.type === 'black-and-white'
                  ? 'Contrast'
                  : activeEffect.type === 'vivid-sharp'
                    ? 'Sharpness'
                    : activeEffect.type === 'grainy'
                      ? 'Grain'
                      : 'Block size'}
              </span>
              <span className={styles.durationValue}>{((activeEffect.intensity ?? 0.5) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={activeEffect.intensity ?? 0.5}
              onPointerDown={intensitySliderHistory}
              onChange={handleIntensityChange}
              className={styles.durationSlider}
            />
          </div>
        )}
    </SidePanelLayout>
  )
}
