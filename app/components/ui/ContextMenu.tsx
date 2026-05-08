'use client'

import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { useSliderHistorySession } from '@/app/hooks/useSliderHistorySession'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import styles from '../tracks/Timeline.module.css'

interface ContextMenuProps {
  onOpenTransitions?: (id: string) => void
  onOpenAnimations?: (id: string) => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
  onOpenSpeed?: (id: string) => void
  onOpenPitch?: (id: string) => void
  onReplace?: (id: string) => void
  onReplaceFromLibrary?: (id: string) => void
  onRemoveBackground?: (id: string) => void
  playbackTime: number
}

export default function ContextMenu({
  onOpenAnimations,
  onOpenFont,
  onOpenEffects,
  onOpenSpeed,
  onOpenPitch,
  onReplace,
  onReplaceFromLibrary,
  onRemoveBackground,
  playbackTime,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [showCropSubMenu, setShowCropSubMenu] = useState(false)
  const { contextMenu, closeContextMenu } = useSelectionStore()
  const { isOpen, x, y, itemId, itemType } = contextMenu

  const videos = useManifestStore((s) => s.videos)
  const images = useManifestStore((s) => s.images)
  const texts = useManifestStore((s) => s.texts)
  const audios = useManifestStore((s) => s.audios)
  const aspectRatio = FIXED_ASPECT_RATIO

  const splitVideo = useManifestStore((s) => s.splitVideo)
  const splitImage = useManifestStore((s) => s.splitImage)
  const splitText = useManifestStore((s) => s.splitText)
  const splitEffect = useManifestStore((s) => s.splitEffect)
  const removeVideo = useManifestStore((s) => s.removeVideo)
  const removeImage = useManifestStore((s) => s.removeImage)
  const removeText = useManifestStore((s) => s.removeText)
  const removeAudio = useManifestStore((s) => s.removeAudio)
  const removeEffect = useManifestStore((s) => s.removeEffect)
  const duplicateItem = useManifestStore((s) => s.duplicateItem)
  const updateVideo = useManifestStore((s) => s.updateVideo)
  const updateImage = useManifestStore((s) => s.updateImage)
  const updateAudio = useManifestStore((s) => s.updateAudio)
  const splitAudio = useManifestStore((s) => s.splitAudio)
  const pushHistory = useManifestStore((s) => s.pushHistory)

  const volumeSliderHistory = useSliderHistorySession()
  const pitchSliderHistory = useSliderHistorySession()
  const fadeOutSliderHistory = useSliderHistorySession()

  const clearSelection = useSelectionStore((s) => s.clearSelection)

  const handleAction = useCallback((action: () => void) => {
    action()
    closeContextMenu()
  }, [closeContextMenu])

  const handleCropAspect = useCallback(async (label: string, w: number, h: number) => {
    if (!itemId) return
    const item = itemType === 'image' 
      ? images.find(i => i.id === itemId)
      : videos.find(v => v.id === itemId)
    if (!item) return

    pushHistory()
    const type = itemType === 'image' ? 'image' : 'video'
    const updates = await computeMediaCropForAspect(item.url || '', type, aspectRatio, w, h, label)
    if (type === 'image') {
      updateImage(item.id, updates as any)
    } else {
      updateVideo(item.id, updates as any)
    }
    closeContextMenu()
  }, [itemId, itemType, images, videos, aspectRatio, pushHistory, updateImage, updateVideo, closeContextMenu])

  useLayoutEffect(() => {
    if (isOpen && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      if (x + menuRect.width > viewportWidth) {
        adjustedX = x - menuRect.width
      }
      if (y + menuRect.height > viewportHeight) {
        adjustedY = y - menuRect.height
      }

      adjustedX = Math.max(8, adjustedX)
      adjustedY = Math.max(8, adjustedY)

      setPos({ x: adjustedX, y: adjustedY })
    }
  }, [isOpen, x, y])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeContextMenu])

  useEffect(() => {
    if (!isOpen) {
      setShowCropSubMenu(false)
    }
  }, [isOpen])

  if (!isOpen || !itemId) return null

  const isSplitDisabled = () => {
    if (itemType === 'video') {
      const v = videos.find((v) => v.id === itemId)
      if (!v) return true
      const local = playbackTime - v.timestamp
      return local <= 0.05 || local >= (v.duration ?? 0) - 0.05
    }
    if (itemType === 'image') {
      const img = images.find((img) => img.id === itemId)
      if (!img) return true
      return playbackTime <= img.startTime + 0.05 || playbackTime >= img.endTime - 0.05
    }
    if (itemType === 'text') {
      const t = texts.find((t) => t.id === itemId)
      if (!t) return true
      return playbackTime <= t.startTime + 0.05 || playbackTime >= t.endTime - 0.05
    }
    if (itemType === 'audio') {
      const a = audios.find((a) => a.id === itemId)
      if (!a) return true
      const local = playbackTime - a.startTime
      const duration = (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1)
      return local <= 0.1 || local >= duration - 0.1
    }
    if (itemType === 'effect') {
      const e = useManifestStore.getState().effects.find((e) => e.id === itemId)
      if (!e) return true
      const local = playbackTime - e.startTime
      const duration = e.endTime - e.startTime
      return local <= 0.05 || local >= duration - 0.05
    }
    return true
  }

  const currentVideo = itemType === 'video' ? videos.find(v => v.id === itemId) : null
  const currentAudio = itemType === 'audio' ? audios.find(a => a.id === itemId) : null
  const currentItem = currentVideo || currentAudio

  const RATIOS = Object.entries(ASPECT_RATIOS).map(([label, [w, h]]) => ({ label, w, h }))

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ 
        top: pos.y, 
        left: pos.x,
        visibility: pos.y === 0 && pos.x === 0 ? 'hidden' : 'visible'
      }}
    >
      {(itemType === 'video' || itemType === 'image' || itemType === 'text' || itemType === 'audio' || itemType === 'effect') && (
        <>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => {
              if (itemType === 'video') splitVideo(itemId, playbackTime)
              else if (itemType === 'image') splitImage(itemId, playbackTime)
              else if (itemType === 'text') splitText(itemId, playbackTime)
              else if (itemType === 'audio') splitAudio(itemId, playbackTime)
              else if (itemType === 'effect') splitEffect(itemId, playbackTime)
            })}
            disabled={isSplitDisabled()}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3L6 21" /><path d="M18 3L18 21" /><path d="M3 12L21 12" />
              </svg>
            </div>
            Split at playhead
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => duplicateItem(itemId))}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </div>
            Duplicate
          </button>
          <div className={styles.contextMenuSeparator} />
        </>
      )}

      {itemType === 'audio' && currentAudio && (
        <>
          <div className={styles.contextMenuSliderItem}>
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#cccccc', marginRight: '8px', minWidth: '45px' }}>Volume</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.05"
              value={currentAudio.volume ?? 1}
              onPointerDown={volumeSliderHistory}
              onChange={(e) => updateAudio(itemId, { volume: parseFloat(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
              className={styles.contextMenuSlider}
            />
            <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '8px', minWidth: '30px' }}>
              {Math.round((currentAudio.volume ?? 1) * 100)}%
            </span>
          </div>
          <div className={styles.contextMenuSliderItem}>
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v9"></path>
                <path d="m9 9 3 3 3-3"></path>
                <path d="M5 16a7 7 0 0 0 14 0"></path>
              </svg>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#cccccc', marginRight: '8px', minWidth: '45px' }}>Pitch</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              value={currentAudio.pitch ?? 1}
              onPointerDown={pitchSliderHistory}
              onChange={(e) => updateAudio(itemId, { pitch: parseFloat(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
              className={styles.contextMenuSlider}
            />
            <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '8px', minWidth: '30px' }}>
              {(currentAudio.pitch ?? 1).toFixed(2)}x
            </span>
          </div>
          <div className={styles.contextMenuSliderItem}>
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9"></path>
                <path d="M12 7v5l4 2"></path>
              </svg>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#cccccc', marginRight: '8px', minWidth: '45px' }}>Fade out</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.05"
              value={Math.max(0, currentAudio.fadeOutDuration ?? 0)}
              onPointerDown={fadeOutSliderHistory}
              onChange={(e) => updateAudio(itemId, { fadeOutDuration: parseFloat(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
              className={styles.contextMenuSlider}
            />
            <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '8px', minWidth: '36px' }}>
              {(currentAudio.fadeOutDuration ?? 0).toFixed(2)}s
            </span>
          </div>
          <div className={styles.contextMenuSeparator} />
        </>
      )}

      {itemType === 'video' && currentVideo && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(() => updateVideo(itemId, { muted: !currentVideo.muted }))}
        >
          <div className={styles.contextMenuIcon}>
            {currentVideo.muted ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
            )}
          </div>
          {currentVideo.muted ? 'Unmute audio' : 'Mute audio'}
        </button>
      )}

      {(itemType === 'video' || itemType === 'image') && (
        <>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => onReplace?.(itemId))}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </div>
            Replace from file
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => onReplaceFromLibrary?.(itemId))}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            Replace from library
          </button>
          {itemType === 'image' && (
            <button
              className={styles.contextMenuItem}
              onClick={() => handleAction(() => onRemoveBackground?.(itemId))}
            >
              <div className={styles.contextMenuIcon}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16" />
                  <path d="M7 6l1 12h8l1-12" />
                  <path d="M9 10h6" />
                </svg>
              </div>
              Remove background
            </button>
          )}
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => onOpenAnimations?.(itemId))}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20" /><path d="m17 7-5-5-5 5" /><path d="m17 17-5 5-5-5" />
              </svg>
            </div>
            Animations
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => {
              pushHistory()
              if (itemType === 'image') {
                const img = images.find((i) => i.id === itemId)
                if (img) updateImage(itemId, { flipHorizontal: !img.flipHorizontal })
              } else {
                const v = videos.find((vi) => vi.id === itemId)
                if (v) updateVideo(itemId, { flipHorizontal: !v.flipHorizontal })
              }
            })}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7h11M8 12h11M8 17h11" />
                <path d="M5 7H3M5 12H3M5 17H3" />
              </svg>
            </div>
            Flip horizontal
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleAction(() => {
              pushHistory()
              if (itemType === 'image') {
                const img = images.find((i) => i.id === itemId)
                if (img) updateImage(itemId, { flipVertical: !img.flipVertical })
              } else {
                const v = videos.find((vi) => vi.id === itemId)
                if (v) updateVideo(itemId, { flipVertical: !v.flipVertical })
              }
            })}
          >
            <div className={styles.contextMenuIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 8v11M12 8v11M17 8v11" />
                <path d="M7 5V3M12 5V3M17 5V3" />
              </svg>
            </div>
            Flip vertical
          </button>
          <div 
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowCropSubMenu(true)}
            onMouseLeave={() => setShowCropSubMenu(false)}
          >
            <button className={styles.contextMenuItem}>
              <div className={styles.contextMenuIcon}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" />
                </svg>
              </div>
              Crop Aspect Ratio
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </button>
            {showCropSubMenu && (
              <div className={styles.contextSubMenu}>
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    className={styles.contextMenuItem}
                    onClick={() => handleCropAspect(r.label, r.w, r.h)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {itemType === 'text' && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(() => onOpenFont?.())}
        >
          <div className={styles.contextMenuIcon}>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>F</span>
          </div>
          Font & Style
        </button>
      )}

      {itemType === 'effect' && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(() => {
            const effect = useManifestStore.getState().effects.find(e => e.id === itemId)
            if (effect) {
              useManifestStore.getState().setPlaybackTime(effect.startTime + 0.001)
              onOpenEffects?.()
            }
          })}
        >
          <div className={styles.contextMenuIcon}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          </div>
          Effect Settings
        </button>
      )}

      {(itemType === 'video' || itemType === 'audio') && currentItem && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(() => onOpenSpeed?.(itemId))}
        >
          <div className={styles.contextMenuIcon}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          Playback Speed
        </button>
      )}
      {itemType === 'audio' && currentAudio && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(() => onOpenPitch?.(itemId))}
        >
          <div className={styles.contextMenuIcon}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v9"/><path d="m9 9 3 3 3-3"/><path d="M5 16a7 7 0 0 0 14 0"/>
            </svg>
          </div>
          Pitch
        </button>
      )}

      <div className={styles.contextMenuSeparator} />
      <button
        className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
        onClick={() => handleAction(() => {
          if (itemType === 'video') removeVideo(itemId)
          else if (itemType === 'image') removeImage(itemId)
          else if (itemType === 'text') removeText(itemId)
          else if (itemType === 'audio') {
            removeAudio(itemId)
            clearSelection()
          }
          else if (itemType === 'effect') removeEffect(itemId)
        })}
      >
        <div className={styles.contextMenuIcon}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
        Delete
      </button>
    </div>
  )
}
