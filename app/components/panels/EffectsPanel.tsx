'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { EffectClass, type EffectType } from '@/app/models/EffectClass'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
}

const EFFECT_OPTIONS: { value: EffectType | 'none'; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'No effect applied',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
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
]

export default function EffectsPanel({ onClose }: Props) {
  const effects = useManifestStore((s) => s.effects)
  const addEffect = useManifestStore((s) => s.addEffect)
  const removeAllEffects = useManifestStore((s) => s.removeAllEffects)
  const getTotalDuration = useManifestStore((s) => s.getTotalDuration)

  const activeEffect = effects[0] ?? null
  const activeType: EffectType | 'none' = activeEffect?.type ?? 'none'

  const handleSelect = (value: EffectType | 'none') => {
    if (value === 'none') {
      removeAllEffects()
    } else {
      removeAllEffects()
      const totalDuration = getTotalDuration()
      addEffect(new EffectClass(
        `effect-${Date.now()}`,
        value,
        0,
        Math.max(totalDuration, 9999)
      ))
    }
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
