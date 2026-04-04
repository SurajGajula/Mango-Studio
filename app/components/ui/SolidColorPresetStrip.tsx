'use client'

import { SOLID_COLOR_PRESETS } from '@/app/lib/solidColorImage'
import styles from './SolidColorPresetStrip.module.css'

type SolidColorPresetStripProps = {
  onPick: (color: string, name: string) => void
  disabled?: boolean
  className?: string
}

export default function SolidColorPresetStrip({ onPick, disabled, className }: SolidColorPresetStripProps) {
  return (
    <div className={`${styles.strip} ${className ?? ''}`} role="group" aria-label="Solid color presets">
      {SOLID_COLOR_PRESETS.map(({ color, name }) => (
        <button
          key={color}
          type="button"
          className={styles.swatch}
          style={{ backgroundColor: color }}
          title={`Add ${name}`}
          disabled={disabled}
          onClick={() => onPick(color, name)}
        />
      ))}
    </div>
  )
}
