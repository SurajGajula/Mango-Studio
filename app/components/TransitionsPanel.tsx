'use client'

import { useState, useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import type { ZoomMode } from '@/app/models/ImageClass'
import styles from './TransitionsPanel.module.css'

interface Props {
  onClose: () => void
}

const ZOOM_OPTIONS: { value: ZoomMode; label: string; desc: string; icon: React.ReactNode }[] = [
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
    value: 'in',
    label: 'Zoom In',
    desc: 'Slowly zooms into the image over its duration',
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
    desc: 'Slowly zooms out from the image over its duration',
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
    desc: 'Zooms in and smoothly shakes the image throughout its duration',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12 Q6 9 8 12 Q10 15 12 12 Q14 9 16 12 Q18 15 20 12" />
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
    value: 'jitter',
    label: 'Jitter',
    desc: 'Quickly shakes the item once at the very start',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12l3-3 4 4 4-4 4 4 5-5" />
      </svg>
    ),
  },
]

export default function TransitionsPanel({ onClose }: Props) {
  const selectedImageId = useSelectionStore((s) => s.selectedImageId)
  const selectedVideoId = useSelectionStore((s) => s.selectedVideoId)
  const images = useManifestStore((s) => s.images)
  const videos = useManifestStore((s) => s.videos)
  const updateImage = useManifestStore((s) => s.updateImage)
  const updateVideo = useManifestStore((s) => s.updateVideo)

  const selectedImage = selectedImageId ? images.find((i) => i.id === selectedImageId) : null
  const selectedVideo = selectedVideoId ? videos.find((v) => v.id === selectedVideoId) : null
  const selectedItem = selectedImage ?? selectedVideo
  const currentZoom: ZoomMode = selectedItem?.zoom ?? 'none'

  // For split transitions, the animation happens during the PREVIOUS item.
  // We need to find the item immediately before the selected one to set the max duration.
  const allMainItems = [
    ...videos.filter(v => !v.isOverlay).map(v => ({ id: v.id, startTime: v.timestamp, duration: v.duration || 0 })),
    ...images.filter(img => img.isMainTrack).map(img => ({ id: img.id, startTime: img.startTime, duration: img.duration }))
  ].sort((a, b) => a.startTime - b.startTime)

  const selectedIdx = allMainItems.findIndex(it => it.id === selectedItem?.id)
  const previousItem = selectedIdx > 0 ? allMainItems[selectedIdx - 1] : null
  
  // Max duration depends on transition type
  const isSplit = ['split-horizontal', 'split-vertical'].includes(currentZoom)
  const maxDuration = isSplit ? (previousItem?.duration || 1.0) : (selectedItem?.duration || 1.0)

  // Use a local state for the slider to ensure it's always responsive
  const [localDuration, setLocalDuration] = useState<number | null>(null)

  // Sync local duration with the selected item's transition duration
  useEffect(() => {
    if (selectedItem) {
      const currentVal = (selectedItem.transitionDuration && selectedItem.transitionDuration > 0) ? selectedItem.transitionDuration : 1.0
      setLocalDuration(Math.max(0.1, Math.min(currentVal, maxDuration)))
    } else {
      setLocalDuration(null)
    }
  }, [selectedItem?.id, selectedItem?.transitionDuration, selectedItem?.duration, maxDuration, isSplit])

  const handleSelect = (zoom: ZoomMode) => {
    const updates: any = { zoom }
    // When switching from 'none' to a transition, default to 1s if not already set
    if (zoom !== 'none' && (selectedItem?.transitionDuration === undefined || selectedItem?.transitionDuration === 0)) {
      updates.transitionDuration = 1.0
    }
    
    if (selectedImageId) updateImage(selectedImageId, updates)
    else if (selectedVideoId) updateVideo(selectedVideoId, updates)
  }

  const itemDuration = selectedItem?.duration || 1.0
  const displayDuration = localDuration !== null ? localDuration : itemDuration

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Transitions</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        {!selectedItem ? (
          <p className={styles.emptyState}>Select an image or video on the timeline to apply a transition.</p>
        ) : (
          <>
            <p className={styles.sectionLabel}>Zoom</p>
            <div className={styles.optionList}>
              {ZOOM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.optionCard} ${currentZoom === opt.value ? styles.optionCardActive : ''}`}
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
            
            {['split-horizontal', 'split-vertical', 'in', 'out'].includes(currentZoom) && (
              <div className={styles.durationControl}>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>Transition Duration</label>
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
                    if (selectedImageId) updateImage(selectedImageId, { transitionDuration: val })
                    else if (selectedVideoId) updateVideo(selectedVideoId, { transitionDuration: val })
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
