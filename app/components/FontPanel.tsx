'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
}

const FONT_OPTIONS: { value: string; label: string; desc: string }[] = [
  {
    value: 'Inter, sans-serif',
    label: 'Inter',
    desc: 'Clean modern sans-serif',
  },
  {
    value: '"Playfair Display", Georgia, serif',
    label: 'Playfair Display',
    desc: 'Elegant classic serif',
  },
]

export default function FontPanel({ onClose }: Props) {
  const selectedTextId = useSelectionStore((s) => s.selectedTextId)
  const texts = useManifestStore((s) => s.texts)
  const updateText = useManifestStore((s) => s.updateText)

  const selectedText = selectedTextId ? texts.find((t) => t.id === selectedTextId) : null
  const currentFont = selectedText?.fontFamily ?? FONT_OPTIONS[0].value

  const handleSelect = (fontFamily: string) => {
    if (selectedTextId) updateText(selectedTextId, { fontFamily })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Font</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        {!selectedText ? (
          <p className={styles.emptyState}>Select a text item on the timeline to change its font.</p>
        ) : (
          <>
            <p className={styles.sectionLabel}>Typeface</p>
            <div className={styles.optionList}>
              {FONT_OPTIONS.map((opt) => {
                const isActive = currentFont === opt.value
                return (
                  <button
                    key={opt.value}
                    className={`${styles.optionCard} ${isActive ? styles.optionCardActive : ''}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span
                      className={styles.optionIcon}
                      style={{ fontFamily: opt.value, fontSize: '1.1rem', fontWeight: 600, color: isActive ? '#fff' : '#aaa' }}
                    >
                      Aa
                    </span>
                    <span className={styles.optionInfo}>
                      <span className={styles.optionName} style={{ fontFamily: opt.value }}>{opt.label}</span>
                      <span className={styles.optionDesc}>{opt.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
