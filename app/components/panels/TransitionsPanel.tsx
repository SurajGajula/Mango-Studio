'use client'

import { useState } from 'react'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import {
  AnimationMode,
  AnimationZoomEasing,
  SlideTransitionEasing,
  TransitionMode,
  ImageClass,
} from '@/app/models/ImageClass'
import { VideoClass } from '@/app/models/VideoClass'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import { SidePanelLayout } from '@/app/components/ui/SidePanelLayout'
import layout from '@/app/components/ui/SidePanelLayout.module.css'
import styles from './TransitionsPanel.module.css'

const SLIDE_SHAKE_ANIMATIONS = new Set<string>(['slide-shake-left', 'slide-shake-right'])
const isSlideShakeAnimation = (value: string | undefined) => !!value && SLIDE_SHAKE_ANIMATIONS.has(value)

interface Props {
  onClose: () => void
  mode: 'animation' | 'transition'
  itemId?: string
}

const ANIMATION_OPTIONS: { value: AnimationMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: 'zoom-in',
    label: 'Zoom in',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.zoomPreviewIn}
      >
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
    ),
  },
  {
    value: 'zoom-out',
    label: 'Zoom out',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.zoomPreviewOut}
      >
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
    ),
  },
  {
    value: 'shake',
    label: 'Shake',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12 Q6 9 8 12 Q10 15 12 12 Q14 9 16 12 Q18 15 20 12" />
      </svg>
    ),
  },
  {
    value: 'jitter',
    label: 'Jitter',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12l3-3 4 4 4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    value: 'slide-shake-left',
    label: 'Slide shake left',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h12" />
        <path d="M8 8l-4 4 4 4" />
        <path d="M17 8q2 2 0 4t0 4" />
      </svg>
    ),
  },
  {
    value: 'slide-shake-right',
    label: 'Slide shake right',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 12h12" />
        <path d="M16 8l4 4-4 4" />
        <path d="M7 8q-2 2 0 4t0 4" />
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

const WIPE_SPEED_OPTIONS: { value: 'linear' | 'ease-in' | 'ease-out'; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Slow -> fast' },
  { value: 'ease-out', label: 'Fast -> slow' },
]

const ZOOM_SPEED_OPTIONS: { value: AnimationZoomEasing; label: string }[] = [
  { value: 'constant', label: 'Constant' },
  { value: 'fast-slow', label: 'Fast → slow' },
  { value: 'slow-fast', label: 'Slow → fast' },
]

const TRANSITION_OPTIONS: { value: TransitionMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: 'split',
    label: 'Split',
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
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
  {
    value: 'morph',
    label: 'Motion blur',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="12" r="5" opacity="0.45" />
        <circle cx="15" cy="12" r="5" opacity="0.45" />
        <path d="M11 12h2" opacity="0.6" />
      </svg>
    ),
  },
  {
    value: 'slide-in',
    label: 'Slide In',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 12h9M15 9l3 3-3 3" />
      </svg>
    ),
  },
  {
    value: 'wipe',
    label: 'Wipe',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="9" y="3" width="6" height="18" fill="currentColor" opacity="0.5" />
      </svg>
    ),
  },
  {
    value: 'circle',
    label: 'Circle',
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
  const selectedItemDuration = selectedItem?.duration ?? 0
  const safeSelectedItemDuration = selectedItemDuration > 0 ? selectedItemDuration : 1.0

  // For split and fade transitions, the animation/effect involves the PREVIOUS item visually.
  // We need to find the item immediately before the selected one to set the max duration.
  const allMainItems = [
    ...videos.filter(v => v.row === 0).map(v => ({ id: v.id, startTime: v.timestamp, duration: v.duration || 0 })),
    ...images.filter(img => img.row === 0).map(img => ({ id: img.id, startTime: img.startTime, duration: img.duration }))
  ].sort((a, b) => a.startTime - b.startTime)

  const selectedIdx = allMainItems.findIndex(it => it.id === selectedItem?.id)
  const previousItem = selectedIdx > 0 ? allMainItems[selectedIdx - 1] : null
  
  // Max duration depends on transition type
  const isTransitionAffectingPrevious = ['split', 'fade', 'morph', 'slide-in', 'wipe', 'circle', 'rotate', 'flash'].includes(currentTransition)
  const maxDuration = (mode === 'transition' && isTransitionAffectingPrevious)
    ? (previousItem?.duration || 1.0)
    : safeSelectedItemDuration
  const durationMin = Math.min(0.1, maxDuration)
  const clampDuration = (v: number) => Math.max(durationMin, Math.min(v, maxDuration))

  // Use a local state for the slider to ensure it's always responsive
  const initialDuration = selectedItem ? (
    mode === 'animation'
      ? clampDuration(
        selectedItem.animationDuration && selectedItem.animationDuration > 0
          ? selectedItem.animationDuration
          : isSlideShakeAnimation(currentAnimation)
            ? Math.min(1, safeSelectedItemDuration)
            : safeSelectedItemDuration
      )
      : clampDuration(selectedItem.transitionDuration && selectedItem.transitionDuration > 0 ? selectedItem.transitionDuration : safeSelectedItemDuration)
  ) : null
  
  const [localDuration, setLocalDuration] = useState<number | null>(initialDuration)
  const [localIntensity, setLocalIntensity] = useState<number | null>(selectedItem?.zoomIntensity ?? 0.5)
  const [localZoomDistance, setLocalZoomDistance] = useState<number | null>(selectedItem?.zoomDistanceIntensity ?? 1)

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

  const [prevInitialZoomDistance, setPrevInitialZoomDistance] = useState<number | null>(selectedItem?.zoomDistanceIntensity ?? 1)
  if ((selectedItem?.zoomDistanceIntensity ?? 1) !== prevInitialZoomDistance) {
    setPrevInitialZoomDistance(selectedItem?.zoomDistanceIntensity ?? 1)
    setLocalZoomDistance(selectedItem?.zoomDistanceIntensity ?? 1)
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
      if (isSlideShakeAnimation(val)) {
        updates.animationDuration = clampDuration(Math.min(1, safeSelectedItemDuration))
        updates.zoomIntensity = 0.1
      } else if (val !== 'none' && (selectedItem?.animationDuration === undefined || selectedItem?.animationDuration === 0)) {
        updates.animationDuration = clampDuration(safeSelectedItemDuration)
      }
      if (val === 'shake' || val === 'jitter') {
        updates.zoomIntensity = 0.5
      }
      if (val === 'zoom-in' || val === 'zoom-out') {
        updates.zoomDistanceIntensity = 1
        updates.animationZoomEasing =
          (selectedItem as ImageClass | VideoClass).animationZoomEasing ?? 'fast-slow'
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
        updates.transitionDuration = clampDuration(safeSelectedItemDuration)
      }
    }

    commitDiscreteChange(updates)
  }

  const itemDuration = safeSelectedItemDuration
  const displayDuration = localDuration !== null ? localDuration : itemDuration
  const displayIntensity = localIntensity !== null ? localIntensity : 0.5
  const displayZoomDistance = localZoomDistance !== null ? localZoomDistance : 1

  const options = mode === 'animation' ? ANIMATION_OPTIONS : TRANSITION_OPTIONS
  const currentValue = mode === 'animation' ? currentAnimation : currentTransition

  const showIntensitySlider =
    mode === 'animation' &&
    (currentAnimation === 'shake' ||
      currentAnimation === 'jitter')

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
    const shouldSyncKeyframeZoom =
      updates.zoomIntensity !== undefined &&
      mode === 'animation' &&
      (currentAnimation === 'shake' || currentAnimation === 'jitter') &&
      Array.isArray((selectedItem as ImageClass | VideoClass).keyframes) &&
      ((selectedItem as ImageClass | VideoClass).keyframes?.length ?? 0) > 0

    if (shouldSyncKeyframeZoom) {
      const keyframes = (selectedItem as ImageClass | VideoClass).keyframes ?? []
      const syncedKeyframes: MediaKeyframe[] = keyframes.map((kf) => ({
        ...kf,
        zoomIntensity: updates.zoomIntensity,
      }))
      applyItemUpdate({ ...updates, keyframes: syncedKeyframes })
      return
    }

    applyItemUpdate(updates)
  }

  return (
    <SidePanelLayout title={mode === 'animation' ? 'Animations' : 'Transitions'} onClose={onClose}>
        {!selectedItem ? (
          <p className={layout.emptyState}>Select an item on the timeline to apply {mode}.</p>
        ) : (
          <>
            <p className={layout.sectionLabel}>{mode === 'animation' ? 'Animation Type' : 'Transition Type'}</p>
            <div className={styles.optionListCompact}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.optionCard} ${currentValue === opt.value ? styles.optionCardActive : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className={styles.optionIcon}>{opt.icon}</span>
                  <span className={styles.optionInfo}>
                    <span className={styles.optionName}>{opt.label}</span>
                  </span>
                </button>
              ))}
            </div>
            
            {currentValue !== 'none' && (
              <div className={styles.durationControl}>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>
                    {isSlideShakeAnimation(currentAnimation) ? 'Slide duration' : 'Duration'}
                  </label>
                  <span className={styles.durationValue}>{displayDuration.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={durationMin}
                  max={maxDuration}
                  step="0.1"
                  value={clampDuration(displayDuration)}
                  className={styles.durationSlider}
                  onPointerDown={durationSliderHistory}
                  onInput={(e) => {
                    const val = clampDuration(parseFloat((e.target as HTMLInputElement).value))
                    const updates = mode === 'animation' ? { animationDuration: val } : { transitionDuration: val }
                    handleSliderUpdate(updates, setLocalDuration)
                  }}
                />
              </div>
            )}

            {mode === 'animation' && (currentAnimation === 'zoom-in' || currentAnimation === 'zoom-out') && (
              <div className={styles.durationControl}>
                <label className={layout.sectionLabel}>Zoom speed</label>
                <div className={`${styles.segmentedControl} ${styles.segmentedControlWrap}`}>
                  {ZOOM_SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.segmentButton} ${(selectedItem.animationZoomEasing ?? 'fast-slow') === opt.value ? styles.segmentActive : ''}`}
                      onClick={() => commitDiscreteChange({ animationZoomEasing: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className={styles.durationHeader}>
                  <label className={styles.durationLabel}>Zoom distance</label>
                  <span className={styles.durationValue}>{displayZoomDistance.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="2.5"
                  step="0.01"
                  value={displayZoomDistance}
                  className={styles.durationSlider}
                  onPointerDown={intensitySliderHistory}
                  onInput={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value)
                    handleSliderUpdate({ zoomDistanceIntensity: val }, setLocalZoomDistance)
                  }}
                />
              </div>
            )}

            {mode === 'transition' && currentTransition === 'split' && (
              <div className={styles.durationControl}>
                <label className={layout.sectionLabel}>Split Axis</label>
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
                  <label className={layout.sectionLabel}>Slide Direction</label>
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
                  <label className={layout.sectionLabel}>Slide Speed Curve</label>
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

            {mode === 'transition' && currentTransition === 'wipe' && (
              <>
                <div className={styles.durationControl}>
                  <label className={layout.sectionLabel}>Wipe Direction</label>
                  <div className={styles.segmentedControl}>
                    {(['left', 'right', 'up', 'down'] as const).map(dir => (
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
                  <label className={layout.sectionLabel}>Wipe Speed</label>
                  <div className={`${styles.segmentedControl} ${styles.segmentedControlWrap}`}>
                    {WIPE_SPEED_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.segmentButton} ${(selectedItem.transitionWipeEasing ?? 'linear') === opt.value ? styles.segmentActive : ''}`}
                        onClick={() => commitDiscreteChange({ transitionWipeEasing: opt.value })}
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
                <label className={layout.sectionLabel}>Circle expand speed</label>
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
              <>
                <div className={styles.durationControl}>
                  <label className={layout.sectionLabel}>Flash Type</label>
                  <div className={styles.segmentedControl}>
                    <button
                      className={`${styles.segmentButton} ${(selectedItem.transitionFlashMode ?? 'solid') === 'solid' ? styles.segmentActive : ''}`}
                      onClick={() => commitDiscreteChange({ transitionFlashMode: 'solid' })}
                    >
                      Solid color
                    </button>
                    <button
                      className={`${styles.segmentButton} ${(selectedItem.transitionFlashMode ?? 'solid') === 'negative' ? styles.segmentActive : ''}`}
                      onClick={() => commitDiscreteChange({ transitionFlashMode: 'negative' })}
                    >
                      Negative
                    </button>
                  </div>
                </div>
                {(selectedItem.transitionFlashMode ?? 'solid') === 'solid' && (
                  <div className={styles.durationControl}>
                    <label className={layout.sectionLabel}>Flash Color</label>
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
              </>
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
    </SidePanelLayout>
  )
}
