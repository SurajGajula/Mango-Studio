'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { EffectClass, type EffectType } from '@/app/models/EffectClass'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
}

const EFFECT_OPTIONS: { value: EffectType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'crt-dither',
    label: 'CRT Dither',
    desc: 'Retro CRT scanlines, grain, and phosphor glow',
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
    label: 'Flashing Vignette',
    desc: 'A black vignette that pulses rhythmically',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" opacity="0.5" />
        <circle cx="12" cy="12" r="2" opacity="0.2" />
      </svg>
    ),
  },
]

export default function EffectsPanel({ onClose }: Props) {
  const effects = useManifestStore((s) => s.effects)
  const addEffect = useManifestStore((s) => s.addEffect)
  const playbackTime = useManifestStore((s) => s.playbackTime)

  const activeEffect = effects.find(e => playbackTime >= e.startTime && playbackTime < e.endTime) ?? null
  const activeType: EffectType | null = activeEffect?.type ?? null

  const findFreeRow = (
    items: Array<{ startTime: number; endTime: number; row: number }>,
    start: number,
    end: number
  ): number => {
    let row = 0
    while (true) {
      const rowItems = items.filter((i) => i.row === row)
      const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
      if (!hasOverlap) return row
      row++
    }
  }

  const handleSelect = (value: EffectType) => {
    const start = playbackTime
    const duration = 5
    const end = start + duration
    
    const effectItems = effects.map((e) => ({ startTime: e.startTime, endTime: e.endTime, row: e.row }))
    const row = findFreeRow(effectItems, start, end)
    
    addEffect(new EffectClass(
      `effect-${Date.now()}`,
      value,
      start,
      end,
      row
    ))
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Effects</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        <p className={styles.sectionLabel}>Video Effect</p>
        <div className={styles.optionList}>
          {EFFECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.optionCard} ${activeType === opt.value ? styles.optionCardActive : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className={styles.optionIcon}>{opt.icon}</span>
              <span className={styles.optionInfo}>
                <span className={styles.optionName}>{opt.label}</span>
                <span className={styles.optionDesc}>{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
