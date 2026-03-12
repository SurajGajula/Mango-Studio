'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { ExportProgress } from '@/app/lib/videoExporter'
import styles from './Timeline.module.css'

interface PlaybackControlsProps {
  playbackTime: number
  totalDuration: number
  formatTime: (seconds: number) => string
  uploadInputRef: React.RefObject<HTMLInputElement>
  onOpenTransitions?: () => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
  isExporting: boolean
  handleExport: () => void
  handleCancelExport: () => void
  exportProgress: ExportProgress | null
  setIsAudioSelected: (selected: boolean) => void
  isAudioSelected: boolean
  handleAddText: () => void
  showCropMenu: boolean
  setShowCropMenu: (show: boolean | ((v: boolean) => boolean)) => void
  cropButtonRef: React.RefObject<HTMLButtonElement>
  cropMenuRef: React.RefObject<HTMLDivElement>
}

export default function PlaybackControls({
  playbackTime,
  totalDuration,
  formatTime,
  uploadInputRef,
  onOpenTransitions,
  onOpenFont,
  onOpenEffects,
  isExporting,
  handleExport,
  handleCancelExport,
  exportProgress,
  setIsAudioSelected,
  isAudioSelected,
  handleAddText,
  showCropMenu,
  setShowCropMenu,
  cropButtonRef,
  cropMenuRef,
}: PlaybackControlsProps) {
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const playbackRate = useManifestStore((state) => state.playbackRate)
  const setPlaybackRate = useManifestStore((state) => state.setPlaybackRate)
  const undo = useManifestStore((state) => state.undo)
  const redo = useManifestStore((state) => state.redo)
  const historyIndex = useManifestStore((state) => state.historyIndex)
  const historyLength = useManifestStore((state) => state.history.length)
  const splitVideo = useManifestStore((state) => state.splitVideo)
  const splitImage = useManifestStore((state) => state.splitImage)
  const splitText = useManifestStore((state) => state.splitText)
  const duplicateItem = useManifestStore((state) => state.duplicateItem)
  const removeVideo = useManifestStore((state) => state.removeVideo)
  const removeImage = useManifestStore((state) => state.removeImage)
  const removeText = useManifestStore((state) => state.removeText)
  const removeAudioFromManifest = useManifestStore((state) => state.removeAudio)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateImage = useManifestStore((state) => state.updateImage)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)

  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)

  const audio = useAudioStore((state) => state.audio)
  const removeAudio = useAudioStore((state) => state.removeAudio)
  const audioAnalysis = useAudioStore((state) => state.analysis)
  const userMarks = useAudioStore((state) => state.userMarks)
  const clearUserMarks = useAudioStore((state) => state.clearUserMarks)
  const isAnalyzing = useAudioStore((state) => state.isAnalyzing)

  return (
    <>
      <div className={styles.playbackControls}>
        <button
          className={styles.historyButton}
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Cmd+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M3 13C5 8 9 5 14 5a9 9 0 0 1 0 18c-4 0-7.5-2-9-5" />
          </svg>
        </button>
        <button
          className={styles.historyButton}
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          title="Redo (Cmd+Y)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M21 13c-2 5-6 8-11 8a9 9 0 0 1 0-18c4 0 7.5 2 9 5" />
          </svg>
        </button>
        <button
          className={styles.playButton}
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={isExporting}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className={styles.speedButton}
          onClick={() => {
            const steps = [0.5, 0.75, 1, 1.5, 2]
            const idx = steps.indexOf(playbackRate)
            setPlaybackRate(steps[(idx + 1) % steps.length])
          }}
          title="Playback speed"
        >
          {playbackRate === 1 ? '1×' : `${playbackRate}×`}
        </button>
        <span className={styles.timeDisplay}>
          {formatTime(playbackTime)} / {formatTime(totalDuration)}
        </span>
        <button
          className={styles.addOverlayButton}
          onClick={() => uploadInputRef.current?.click()}
          title="Upload video or image (Cmd+U)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <button
          className={styles.deleteButton}
          onClick={() => {
            if (selectedVideoId) removeVideo(selectedVideoId)
            else if (selectedImageId) removeImage(selectedImageId)
            else if (selectedTextId) removeText(selectedTextId)
            else if (isAudioSelected) { if (audio) removeAudioFromManifest(audio.id); removeAudio(); setIsAudioSelected(false) }
          }}
          disabled={!selectedVideoId && !selectedImageId && !selectedTextId && !isAudioSelected}
          title="Delete selected (Cmd+D)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
        <button
          className={styles.splitButton}
          onClick={() => {
            if (selectedVideoId) splitVideo(selectedVideoId, playbackTime)
            else if (selectedImageId) splitImage(selectedImageId, playbackTime)
            else if (selectedTextId) splitText(selectedTextId, playbackTime)
          }}
          disabled={(() => {
            if (selectedVideoId) {
              const v = videos.find((v) => v.id === selectedVideoId)
              if (!v) return true
              const local = playbackTime - v.timestamp
              return local <= 0.05 || local >= (v.duration ?? 0) - 0.05
            }
            if (selectedImageId) {
              const img = images.find((img) => img.id === selectedImageId && img.isMainTrack)
              if (!img) return true
              return playbackTime <= img.startTime + 0.05 || playbackTime >= img.endTime - 0.05
            }
            if (selectedTextId) {
              const t = texts.find((t) => t.id === selectedTextId)
              if (!t) return true
              return playbackTime <= t.startTime + 0.05 || playbackTime >= t.endTime - 0.05
            }
            return true
          })()}
          title="Split at playhead"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3L6 21" />
            <path d="M18 3L18 21" />
            <path d="M3 12L21 12" />
          </svg>
        </button>
        <button
          className={styles.splitButton}
          onClick={() => {
            if (selectedVideoId) duplicateItem(selectedVideoId)
            else if (selectedImageId) duplicateItem(selectedImageId)
            else if (selectedTextId) duplicateItem(selectedTextId)
          }}
          disabled={!selectedVideoId && !selectedImageId && !selectedTextId}
          title="Duplicate selected (Cmd+Shift+D)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          className={styles.addTextButton}
          onClick={handleAddText}
          disabled={videos.filter((v) => !v.isOverlay).length === 0 && images.filter((img) => img.isMainTrack).length === 0}
          title="Add text"
        >
          T
        </button>
        <button
          className={styles.transitionsButton}
          onClick={onOpenTransitions}
          disabled={!selectedImageId && !selectedVideoId}
          title="Transitions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="12" r="5" />
            <circle cx="16" cy="12" r="5" />
          </svg>
        </button>
        <button
          className={styles.transitionsButton}
          onClick={onOpenFont}
          disabled={!selectedTextId}
          title="Font"
          style={{ fontWeight: 700, fontSize: '13px' }}
        >
          F
        </button>
        <button
          className={styles.transitionsButton}
          onClick={onOpenEffects}
          title="Effects"
          style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.02em' }}
        >
          Fx
        </button>
        <div className={styles.cropMenuWrapper}>
          <button
            ref={cropButtonRef}
            className={styles.cropButton}
            onClick={() => setShowCropMenu((v) => !v)}
            disabled={!selectedImageId && !selectedVideoId}
            title="Crop aspect ratio"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
              <path d="M18 22V8a2 2 0 0 0-2-2H2" />
            </svg>
          </button>
          {showCropMenu && (selectedImageId || selectedVideoId) && (() => {
            const item = selectedImageId 
              ? images.find((i) => i.id === selectedImageId)
              : videos.find((v) => v.id === selectedVideoId)
            const RATIOS = [
              { label: '16:9', w: 16, h: 9 },
              { label: '4:3', w: 4, h: 3 },
              { label: '1:1', w: 1, h: 1 },
              { label: '3:4', w: 3, h: 4 },
              { label: '9:16', w: 9, h: 16 },
            ]
            return (
              <div ref={cropMenuRef} className={styles.cropMenu}>
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    className={`${styles.cropMenuItem} ${item?.cropAspect === r.label ? styles.cropMenuItemActive : ''}`}
                    onClick={async () => {
                      setShowCropMenu(false)
                      if (!item) return
                      pushHistory()
                      const type = selectedImageId ? 'image' : 'video'
                      const updates = await computeMediaCropForAspect(item.url || '', type, aspectRatio, r.w, r.h, r.label)
                      if (type === 'image') {
                        updateImage(item.id, updates as Partial<ImageClass>)
                      } else {
                        updateVideo(item.id, updates as Partial<VideoClass>)
                      }
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )
          })()}
        </div>
        {audioAnalysis && userMarks.length > 0 && (
          <button
            className={styles.clearMarksButton}
            onClick={clearUserMarks}
            title="Clear all manual marks"
          >
            ✕ {userMarks.length}
          </button>
        )}
        {isAnalyzing && (
          <span className={styles.analyzingBadge}>Analyzing…</span>
        )}
        <button
          className={styles.exportButton}
          onClick={handleExport}
          disabled={isExporting || (videos.filter((v) => !v.isOverlay).length === 0 && images.filter((img) => img.isMainTrack).length === 0)}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
      {exportProgress && (
        <div className={styles.exportProgressWrapper}>
          <div className={styles.exportProgress}>
            <div
              className={styles.exportProgressBar}
              style={{ width: `${exportProgress.progress}%` }}
            />
            <span className={styles.exportProgressText}>{exportProgress.message}</span>
          </div>
          {isExporting && (
            <button className={styles.exportCancelBtn} onClick={handleCancelExport} title="Cancel export">✕</button>
          )}
        </div>
      )}
    </>
  )
}
