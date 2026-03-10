'use client'

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

  const handleSelect = (zoom: ZoomMode) => {
    if (selectedImageId) updateImage(selectedImageId, { zoom })
    else if (selectedVideoId) updateVideo(selectedVideoId, { zoom })
  }

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
          </>
        )}
      </div>
    </div>
  )
}
