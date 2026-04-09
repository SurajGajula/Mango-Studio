'use client'

import { SOLID_COLOR_PRESETS, type SolidShapeKind } from '@/app/lib/solidColorImage'
import styles from './SolidColorPresetStrip.module.css'

type SolidColorPresetStripProps = {
  onPick: (shape: SolidShapeKind, color: string, name: string) => void
  disabled?: boolean
  className?: string
}

export default function SolidColorPresetStrip({ onPick, disabled, className }: SolidColorPresetStripProps) {
  return (
    <div className={`${styles.strip} ${className ?? ''}`} role="group" aria-label="Solid color presets">
      {SOLID_COLOR_PRESETS.map(({ color, name }) => (
        <div key={color} className={styles.presetRow}>
          <button
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: color }}
            title={`Add ${name} square`}
            disabled={disabled}
            onClick={() => onPick('square', color, name)}
          />
          <button
            type="button"
            className={`${styles.swatch} ${styles.circle}`}
            style={{ backgroundColor: color }}
            title={`Add ${name} circle`}
            disabled={disabled}
            onClick={() => onPick('circle', color, name)}
          />
          <button
            type="button"
            className={`${styles.swatch} ${styles.arrow}`}
            style={{ backgroundColor: color }}
            title={`Add ${name} arrow`}
            disabled={disabled}
            onClick={() => onPick('arrow', color, name)}
          />
        </div>
      ))}
    </div>
  )
}
