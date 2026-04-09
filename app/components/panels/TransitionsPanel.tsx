'use client'

import { useState } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { AnimationMode, SlideTransitionEasing, TransitionMode, ImageClass } from '@/app/models/ImageClass'
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
    value: 'pulse',
    label: 'Pulse',
    desc: 'Parabolic zoom: rises over 75% of the clip, falls over the rest',
    icon: (
      <svg 
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: 'pulse-preview 2s linear infinite' }}
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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
  {
    value: 'last-frame-hold',
    label: 'Last frame hold',
    desc: 'Video plays, then stays on the last frame for the rest of the clip',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="10" height="10" rx="1" />
        <path d="M9 9l2 2 4-4" />
        <line x1="4" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
]

const REVEAL_CURVE_OPTIONS: { value: SlideTransitionEasing; label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'ease-in', label: 'Slow → fast' },
  { value: 'ease-out', label: 'Fast → slow' },
  { value: 'linear', label: 'Linear' },
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
    value: 'split',
    label: 'Split',
    desc: 'The previous item splits and slides to reveal this item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <path d="M9 9l-3 3 3 3M15 9l3 3-3 3" />
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
  {
    value: 'slide-in',
    label: 'Slide In',
    desc: 'This item slides in from a direction, on top of the previous item',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 12h9M15 9l3 3-3 3" />
      </svg>
    ),
  },
  {
    value: 'circle',
    label: 'Circle',
    desc: 'This item expands from a circle in the center to reveal the content',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: 'rotate',
    label: 'Rotate',
    desc: 'The items rotate through 180 degrees to switch',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    ),
  },
  {
    value: 'flash',
    label: 'Flash',
    desc: 'The screen flashes a color between items',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="6" fill="currentColor" />
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
  const isTransitionAffectingPrevious = ['split', 'fade', 'slide-in', 'circle', 'rotate', 'flash'].includes(currentTransition)
  const isLastFrameHold =
    mode === 'animation' &&
    currentAnimation === 'last-frame-hold' &&
    !!selectedItem &&
    videos.some((v) => v.id === selectedItem.id)
  const maxDuration = (mode === 'transition' && isTransitionAffectingPrevious)
    ? (previousItem?.duration || 1.0)
    : isLastFrameHold
      ? Math.max(0.1, selectedItem?.duration || 1.0)
      : (selectedItem?.duration || 1.0)

  // Use a local state for the slider to ensure it's always responsive
  const initialDuration = selectedItem ? (
    mode === 'animation' 
      ? (selectedItem.animationDuration && selectedItem.animationDuration > 0 ? selectedItem.animationDuration : 1.0)
      : (selectedItem.transitionDuration && selectedItem.transitionDuration > 0 ? selectedItem.transitionDuration : 1.0)
  ) : null
  
  const [localDuration, setLocalDuration] = useState<number | null>(initialDuration)
  const [localIntensity, setLocalIntensity] = useState<number | null>(selectedItem?.zoomIntensity ?? 0.5)

  // Adjust state during render if props change externally (e.g. Undo/Redo)
  const [prevInitialDuration, setPrevInitialDuration] = useState<number | null>(initialDuration)
  if (initialDuration !== prevInitialDuration) {
    setPrevInitialDuration(initialDuration)
    setLocalDuration(initialDuration)
  }

  const [prevInitialIntensity, setPrevInitialIntensity] = useState<number | null>(selectedItem?.zoomIntensity ?? 0.5)
  if ((selectedItem?.zoomIntensity ?? 0.5) !== prevInitialIntensity) {
    setPrevInitialIntensity(selectedItem?.zoomIntensity ?? 0.5)
    setLocalIntensity(selectedItem?.zoomIntensity ?? 0.5)
  }

  const setPlaybackTime = useManifestStore((s) => s.setPlaybackTime)
  const setIsPlaying = useManifestStore((s) => s.setIsPlaying)

  const durationSliderHistory = useSliderHistorySession()
  const intensitySliderHistory = useSliderHistorySession()

  const handleSelect = (val: string) => {
    if (!selectedItem) return
    const updates: any = {}
    if (mode === 'animation') {
      updates.animation = val
      if (val === 'last-frame-hold' && videos.some((v) => v.id === selectedItem.id)) {
        const d = selectedItem.duration ?? 1
        updates.animationDuration = Math.min(Math.max(0.1, d * 0.25), d)
      } else if (val !== 'none' && (selectedItem?.animationDuration === undefined || selectedItem?.animationDuration === 0)) {
        updates.animationDuration = 1.0
      }
      if (val !== 'none') {
        updates.zoomIntensity = 0.5
      }

      if (val !== 'none') {
        const itemStart = (selectedItem as any).startTime !== undefined ? (selectedItem as any).startTime : (selectedItem as any).timestamp
        setPlaybackTime(itemStart)
        setIsPlaying(true)
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
  const displayIntensity = localIntensity !== null ? localIntensity : 0.5

  const options = mode === 'animation' ? ANIMATION_OPTIONS : TRANSITION_OPTIONS
  const currentValue = mode === 'animation' ? currentAnimation : currentTransition

  const showIntensitySlider = mode === 'animation' && ['shake', 'jitter'].includes(currentAnimation)

  const applyItemUpdate = (updates: any) => {
    if (!selectedItem) return
    const isImage = images.some((img) => img.id === selectedItem.id)
    if (isImage) updateImage(selectedItem.id, updates)
    else updateVideo(selectedItem.id, updates)
  }

  const commitDiscreteChange = (updates: any) => {
    if (!selectedItem) return
    const st = useManifestStore.getState()
    st.pauseHistory()
    applyItemUpdate(updates)
    st.resumeHistory()
    st.pushHistory()
  }

  const handleSliderUpdate = (updates: any, localSetter: (val: any) => void) => {
    if (!selectedItem) return
    const val = Object.values(updates)[0]
    localSetter(val)
    applyItemUpdate(updates)
  }

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
              {options
                .filter((opt) => opt.value !== 'last-frame-hold' || (!!selectedItem && videos.some((v) => v.id === selectedItem.id)))
                .map((opt) => (
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
            
            {currentValue !== 'none' && currentAnimation !== 'pulse' && (
              <div className={styles.durationControl}>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>
                    {isLastFrameHold ? 'Hold duration' : 'Duration'}
                  </label>
                  <span className={styles.durationValue}>{displayDuration.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max={maxDuration}
                  step="0.1"
                  value={Math.min(displayDuration, maxDuration)}
                  className={styles.durationSlider}
                  onPointerDown={durationSliderHistory}
                  onInput={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value)
                    const updates = mode === 'animation' ? { animationDuration: val } : { transitionDuration: val }
                    handleSliderUpdate(updates, setLocalDuration)
                  }}
                />
              </div>
            )}

            {mode === 'transition' && currentTransition === 'split' && (
              <div className={styles.durationControl}>
                <label className={styles.sectionLabel}>Split Axis</label>
                <div className={styles.segmentedControl}>
                  <button 
                    className={`${styles.segmentButton} ${selectedItem.transitionAxis === 'horizontal' ? styles.segmentActive : ''}`}
                    onClick={() => commitDiscreteChange({ transitionAxis: 'horizontal' })}
                  >
                    Horizontal
                  </button>
                  <button 
                    className={`${styles.segmentButton} ${selectedItem.transitionAxis === 'vertical' ? styles.segmentActive : ''}`}
                    onClick={() => commitDiscreteChange({ transitionAxis: 'vertical' })}
                  >
                    Vertical
                  </button>
                </div>
              </div>
            )}

            {mode === 'transition' && currentTransition === 'slide-in' && (
              <>
                <div className={styles.durationControl}>
                  <label className={styles.sectionLabel}>Slide Direction</label>
                  <div className={styles.segmentedControl}>
                    {(['left', 'right', 'top', 'bottom'] as const).map(dir => (
                      <button 
                        key={dir}
                        className={`${styles.segmentButton} ${selectedItem.transitionDirection === dir ? styles.segmentActive : ''}`}
                        onClick={() => commitDiscreteChange({ transitionDirection: dir })}
                      >
                        {dir.charAt(0).toUpperCase() + dir.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.durationControl}>
                  <label className={styles.sectionLabel}>Slide Speed Curve</label>
                  <div className={`${styles.segmentedControl} ${styles.segmentedControlWrap}`}>
                    {REVEAL_CURVE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.segmentButton} ${(selectedItem.transitionSlideEasing ?? 'smooth') === opt.value ? styles.segmentActive : ''}`}
                        onClick={() => commitDiscreteChange({ transitionSlideEasing: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {mode === 'transition' && currentTransition === 'circle' && (
              <div className={styles.durationControl}>
                <label className={styles.sectionLabel}>Circle expand speed</label>
                <div className={`${styles.segmentedControl} ${styles.segmentedControlWrap}`}>
                  {REVEAL_CURVE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.segmentButton} ${(selectedItem.transitionCircleEasing ?? 'smooth') === opt.value ? styles.segmentActive : ''}`}
                      onClick={() => commitDiscreteChange({ transitionCircleEasing: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'transition' && currentTransition === 'flash' && (
              <div className={styles.durationControl}>
                <label className={styles.sectionLabel}>Flash Color</label>
                <div className={styles.colorPresets}>
                  {[
                    { name: 'White', color: '#FFFFFF' },
                    { name: 'Black', color: '#000000' },
                    { name: 'Red', color: '#FF0000' },
                    { name: 'Yellow', color: '#FFFF00' }
                  ].map(preset => (
                    <button 
                      key={preset.color}
                      className={`${styles.colorChip} ${selectedItem.transitionColor === preset.color ? styles.chipActive : ''}`}
                      style={{ backgroundColor: preset.color }}
                      onClick={() => commitDiscreteChange({ transitionColor: preset.color })}
                      title={preset.name}
                    />
                  ))}
                  <input 
                    type="color" 
                    value={selectedItem.transitionColor || '#FFFFFF'} 
                    onChange={(e) => commitDiscreteChange({ transitionColor: e.target.value })}
                    className={styles.colorPicker}
                  />
                </div>
              </div>
            )}

            {showIntensitySlider && (
              <div className={styles.durationControl}>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>Intensity (Force)</label>
                  <span className={styles.durationValue}>{Math.round(displayIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="1.0"
                  step="0.01"
                  value={displayIntensity}
                  className={styles.durationSlider}
                  onPointerDown={intensitySliderHistory}
                  onInput={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value)
                    handleSliderUpdate({ zoomIntensity: val }, setLocalIntensity)
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
