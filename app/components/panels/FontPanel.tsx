'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { TextAnimation, TextStyle } from '@/app/models/TextClass'
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
  {
    value: 'Antonio, sans-serif',
    label: 'Antonio',
    desc: 'Thin modern font',
  },
  {
    value: '"Bubble Sans", cursive',
    label: 'Bubble Sans',
    desc: 'Custom comic manga style',
  },
]

const ANIMATION_OPTIONS: { value: TextAnimation; label: string; desc: string }[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'No animation',
  },
  {
    value: 'keyboard',
    label: 'Keyboard',
    desc: 'Words appear one by one',
  },
  {
    value: 'shake',
    label: 'Shake',
    desc: 'Smooth camera-like shake for full duration',
  },
]

const STYLE_OPTIONS: { value: TextStyle; label: string; desc: string }[] = [
  {
    value: 'normal',
    label: 'Normal',
    desc: 'Default text style',
  },
  {
    value: 'negative',
    label: 'Negative',
    desc: 'Shows negative of background',
  },
  {
    value: 'highlight',
    label: 'Highlight',
    desc: 'Yellow text on black box',
  },
]

export default function FontPanel({ onClose }: Props) {
  const selectedTextId = useSelectionStore((s) => s.selectedTextId)
  const texts = useManifestStore((s) => s.texts)
  const updateText = useManifestStore((s) => s.updateText)

  const selectedText = selectedTextId ? texts.find((t) => t.id === selectedTextId) : null
  const currentFont = selectedText?.fontFamily ?? FONT_OPTIONS[0].value
  const currentAnimation = selectedText?.animation ?? 'none'
  const currentStyle = selectedText?.style ?? 'normal'

  const handleSelect = (fontFamily: string) => {
    if (selectedTextId) {
      const updates: any = { fontFamily }
      if (fontFamily.includes('Antonio')) {
        updates.fontWeight = '300'
      } else if (fontFamily.includes('Inter')) {
        updates.fontWeight = '600'
      } else if (fontFamily.includes('Playfair')) {
        updates.fontWeight = '600'
      } else if (fontFamily.includes('Bubble Sans')) {
        updates.fontWeight = '400'
      }
      updateText(selectedTextId, updates)
    }
  }

  const handleAnimationSelect = (animation: TextAnimation) => {
    if (selectedTextId) {
      updateText(selectedTextId, { animation })
    }
  }

  const handleStyleSelect = (style: TextStyle) => {
    if (selectedTextId) {
      updateText(selectedTextId, { style })
    }
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
                      style={{
                        fontFamily: opt.value,
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        color: isActive ? '#fff' : '#aaa',
                      }}
                    >
                      Aa
                    </span>
                    <span className={styles.optionInfo}>
                      <span
                        className={styles.optionName}
                        style={{
                          fontFamily: opt.value,
                        }}
                      >
                        {opt.label}
                      </span>
                      <span className={styles.optionDesc}>{opt.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={styles.sectionLabel} style={{ marginTop: '1.5rem' }}>Animation</p>
            <div className={styles.optionList}>
              {ANIMATION_OPTIONS.map((opt) => {
                const isActive = currentAnimation === opt.value
                return (
                  <button
                    key={opt.value}
                    className={`${styles.optionCard} ${isActive ? styles.optionCardActive : ''}`}
                    onClick={() => handleAnimationSelect(opt.value)}
                  >
                    <span className={styles.optionInfo}>
                      <span className={styles.optionName}>{opt.label}</span>
                      <span className={styles.optionDesc}>{opt.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={styles.sectionLabel} style={{ marginTop: '1.5rem' }}>Style</p>
            <div className={styles.optionList}>
              {STYLE_OPTIONS.map((opt) => {
                const isActive = currentStyle === opt.value
                return (
                  <button
                    key={opt.value}
                    className={`${styles.optionCard} ${isActive ? styles.optionCardActive : ''}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStyleSelect(opt.value) }}
                  >
                    <span
                      className={styles.optionIcon}
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        backgroundColor: opt.value === 'negative' ? '#fff' : (opt.value === 'highlight' ? '#000' : undefined),
                        color:
                          opt.value === 'negative'
                            ? (isActive ? '#000' : '#444')
                            : opt.value === 'highlight'
                              ? '#ffff00'
                              : (isActive ? '#fff' : '#aaa'),
                        padding: opt.value === 'highlight' ? '2px 4px' : undefined,
                        borderRadius: opt.value === 'highlight' ? '2px' : undefined,
                      }}
                    >
                      {opt.value === 'negative' ? '±' : 'Ab'}
                    </span>
                    <span className={styles.optionInfo}>
                      <span className={styles.optionName}>{opt.label}</span>
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
