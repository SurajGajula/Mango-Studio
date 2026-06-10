'use client'

import { Antonio, Playfair_Display } from 'next/font/google'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { TextAnimation, TextStyle } from '@/app/models/TextClass'
import { SidePanelLayout } from '@/app/components/ui/SidePanelLayout'
import layout from '@/app/components/ui/SidePanelLayout.module.css'
import styles from './TransitionsPanel.module.css'

const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap' })
const antonio = Antonio({ subsets: ['latin'], weight: '300', display: 'swap' })
const panelFontClass = [playfair.className, antonio.className].join(' ')

interface Props {
  onClose: () => void
}

const FONT_OPTIONS: { value: string; label: string }[] = [
  {
    value: 'Inter, sans-serif',
    label: 'Inter',
  },
  {
    value: '"Playfair Display", Georgia, serif',
    label: 'Playfair Display',
  },
  {
    value: 'Antonio, sans-serif',
    label: 'Antonio',
  },
  {
    value: '"Bubble Sans", cursive',
    label: 'Bubble Sans',
  },
]

const ANIMATION_OPTIONS: { value: TextAnimation; label: string }[] = [
  {
    value: 'none',
    label: 'None',
  },
  {
    value: 'keyboard',
    label: 'Keyboard',
  },
  {
    value: 'speech',
    label: 'Speech',
  },
  {
    value: 'shake',
    label: 'Shake',
  },
]

const STYLE_OPTIONS: { value: TextStyle; label: string }[] = [
  {
    value: 'normal',
    label: 'Normal',
  },
  {
    value: 'negative',
    label: 'Negative',
  },
  {
    value: 'highlight',
    label: 'Highlight',
  },
]

export default function FontPanel({ onClose }: Props) {
  const selectedTextId = useSelectionStore((s) => s.selectedTextId)
  const texts = useManifestStore((s) => s.texts)
  const updateText = useManifestStore((s) => s.updateText)
  const pushHistory = useManifestStore((s) => s.pushHistory)

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
      pushHistory()
    }
  }

  const handleAnimationSelect = (animation: TextAnimation) => {
    if (selectedTextId) {
      updateText(selectedTextId, { animation })
      pushHistory()
    }
  }

  const handleStyleSelect = (style: TextStyle) => {
    if (selectedTextId) {
      updateText(selectedTextId, { style })
      pushHistory()
    }
  }

  return (
    <div className={panelFontClass}>
    <SidePanelLayout title="Font" onClose={onClose}>
        {!selectedText ? (
          <p className={layout.emptyState}>Select a text item on the timeline to change its font.</p>
        ) : (
          <>
            <p className={layout.sectionLabel}>Typeface</p>
            <div className={styles.optionListCompact}>
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
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={layout.sectionLabel} style={{ marginTop: '1.5rem' }}>Animation</p>
            <div className={styles.optionListCompact}>
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
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={layout.sectionLabel} style={{ marginTop: '1.5rem' }}>Style</p>
            <div className={styles.optionListCompact}>
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
                              ? '#ffffff'
                              : (isActive ? '#fff' : '#aaa'),
                        padding: opt.value === 'highlight' ? '2px 4px' : undefined,
                        borderRadius: opt.value === 'highlight' ? '2px' : undefined,
                      }}
                    >
                      {opt.value === 'negative' ? '±' : 'Ab'}
                    </span>
                    <span className={styles.optionInfo}>
                      <span className={styles.optionName}>{opt.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
    </SidePanelLayout>
    </div>
  )
}
