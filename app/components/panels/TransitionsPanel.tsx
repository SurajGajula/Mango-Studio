'use client'

import { useState, useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { AnimationMode, TransitionMode, ImageClass } from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
  mode: 'animation' | 'transition'
  itemId?: string
}

const ANIMATION_OPTIONS: { value: AnimationMode; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'No animation',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: 'in',
    label: 'Zoom In',
    desc: 'Slowly zooms into the item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    value: 'out',
    label: 'Zoom Out',
    desc: 'Slowly zooms out from the item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    value: 'shake',
    label: 'Shake',
    desc: 'Zooms in and smoothly shakes the item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12 Q6 9 8 12 Q10 15 12 12 Q14 9 16 12 Q18 15 20 12" />
      </svg>
    ),
  },
  {
    value: 'jitter',
    label: 'Jitter',
    desc: 'Quickly shakes the item once at the start',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12l3-3 4 4 4-4 4 4 5-5" />
      </svg>
    ),
  },
]

const TRANSITION_OPTIONS: { value: TransitionMode; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'No transition effect',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: 'split-horizontal',
    label: 'Split (H)',
    desc: 'The previous item splits and slides horizontally to reveal this item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <path d="M9 9l-3 3 3 3M15 9l3 3-3 3" />
      </svg>
    ),
  },
  {
    value: 'split-vertical',
    label: 'Split (V)',
    desc: 'The previous item splits and slides vertically to reveal this item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M9 9l3-3 3 3M9 15l3 3 3-3" />
      </svg>
    ),
  },
  {
    value: 'fade',
    label: 'Fade',
    desc: 'The previous item smoothly fades into this item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
]

export default function TransitionsPanel({ mode, onClose, itemId }: Props) {
  const selectedImageId = useSelectionStore((s) => s.selectedImageId)
  const selectedVideoId = useSelectionStore((s) => s.selectedVideoId)
  const images = useManifestStore((s) => s.images)
  const videos = useManifestStore((s) => s.videos)
  const updateImage = useManifestStore((s) => s.updateImage)
  const updateVideo = useManifestStore((s) => s.updateVideo)

  const selectedImage = selectedImageId ? images.find((i) => i.id === selectedImageId) : null
  const selectedVideo = selectedVideoId ? videos.find((v) => v.id === selectedVideoId) : null
  
  // Use itemId if provided (for transitions), otherwise fallback to global selection
  const targetItem = itemId 
    ? (images.find(i => i.id === itemId) || videos.find(v => v.id === itemId))
    : (selectedImage ?? selectedVideo)

  const selectedItem = targetItem
  
  const currentAnimation = selectedItem?.animation ?? 'none'
  const currentTransition = selectedItem?.transition ?? 'none'

  // For split and fade transitions, the animation/effect involves the PREVIOUS item visually.
  // We need to find the item immediately before the selected one to set the max duration.
  const allMainItems = [
    ...videos.filter(v => !v.isOverlay).map(v => ({ id: v.id, startTime: v.timestamp, duration: v.duration || 0 })),
    ...images.filter(img => img.isMainTrack).map(img => ({ id: img.id, startTime: img.startTime, duration: img.duration }))
  ].sort((a, b) => a.startTime - b.startTime)

  const selectedIdx = allMainItems.findIndex(it => it.id === selectedItem?.id)
  const previousItem = selectedIdx > 0 ? allMainItems[selectedIdx - 1] : null
  
  // Max duration depends on transition type
  const isTransitionAffectingPrevious = ['split-horizontal', 'split-vertical', 'fade'].includes(currentTransition)
  const maxDuration = (mode === 'transition' && isTransitionAffectingPrevious) ? (previousItem?.duration || 1.0) : (selectedItem?.duration || 1.0)

  // Use a local state for the slider to ensure it's always responsive
  const [localDuration, setLocalDuration] = useState<number | null>(null)

  // Sync local duration with the selected item's transition/animation duration
  useEffect(() => {
    if (selectedItem) {
      const currentVal = mode === 'animation' 
        ? (selectedItem.animationDuration && selectedItem.animationDuration > 0 ? selectedItem.animationDuration : 1.0)
        : (selectedItem.transitionDuration && selectedItem.transitionDuration > 0 ? selectedItem.transitionDuration : 1.0)
      setLocalDuration(Math.max(0.1, Math.min(currentVal, maxDuration)))
    } else {
      setLocalDuration(null)
    }
  }, [selectedItem?.id, selectedItem?.transitionDuration, selectedItem?.animationDuration, selectedItem?.duration, maxDuration, mode])

  const handleSelect = (val: string) => {
    if (!selectedItem) return
    const updates: any = {}
    if (mode === 'animation') {
      updates.animation = val
      // When switching from 'none' to something, default to 1s if not already set
      if (val !== 'none' && (selectedItem?.animationDuration === undefined || selectedItem?.animationDuration === 0)) {
        updates.animationDuration = 1.0
      }
    } else {
      updates.transition = val
      // When switching from 'none' to something, default to 1s if not already set
      if (val !== 'none' && (selectedItem?.transitionDuration === undefined || selectedItem?.transitionDuration === 0)) {
        updates.transitionDuration = 1.0
      }
    }
    
    const isImage = images.some(img => img.id === selectedItem.id)
    if (isImage) updateImage(selectedItem.id, updates)
    else updateVideo(selectedItem.id, updates)
  }

  const itemDuration = selectedItem?.duration || 1.0
  const displayDuration = localDuration !== null ? localDuration : itemDuration

  const options = mode === 'animation' ? ANIMATION_OPTIONS : TRANSITION_OPTIONS
  const currentValue = mode === 'animation' ? currentAnimation : currentTransition

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>{mode === 'animation' ? 'Animations' : 'Transitions'}</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        {!selectedItem ? (
          <p className={styles.emptyState}>Select an item on the timeline to apply {mode}.</p>
        ) : (
          <>
            <p className={styles.sectionLabel}>{mode === 'animation' ? 'Animation Type' : 'Transition Type'}</p>
            <div className={styles.optionList}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.optionCard} ${currentValue === opt.value ? styles.optionCardActive : ''}`}
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
            
            {(currentValue !== 'none' || (mode === 'animation' && (currentAnimation === 'in' || currentAnimation === 'out'))) && (
              <div className={styles.durationControl}>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>Duration</label>
                  <span className={styles.durationValue}>{displayDuration.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max={maxDuration}
                  step="0.1"
                  value={displayDuration}
                  className={styles.durationSlider}
                  onInput={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value)
                    setLocalDuration(val)
                  }}
                  onChange={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value)
                    if (!selectedItem) return
                    const isImage = images.some(img => img.id === selectedItem.id)
                    const updates = mode === 'animation' ? { animationDuration: val } : { transitionDuration: val }
                    if (isImage) updateImage(selectedItem.id, updates)
                    else updateVideo(selectedItem.id, updates)
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
