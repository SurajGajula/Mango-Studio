'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { ExportProgress } from '@/app/lib/videoExporter'
import styles from './tracks/Timeline.module.css'

interface PlaybackControlsProps {
  playbackTime: number
  totalDuration: number
  formatTime: (seconds: number) => string
  uploadInputRef: React.RefObject<HTMLInputElement>
  onOpenTransitions?: (id?: string) => void
  onOpenFont?: () => void
  onOpenEffects?: () => void
  onOpenSpeed?: (id: string) => void
  isExporting: boolean
  handleExport: () => void
  handleCancelExport: () => void
  exportProgress: ExportProgress | null
  handleAddText: () => void
}

export default function PlaybackControls({
  playbackTime,
  totalDuration,
  formatTime,
  uploadInputRef,
  onOpenTransitions,
  onOpenFont,
  onOpenEffects,
  onOpenSpeed,
  isExporting,
  handleExport,
  handleCancelExport,
  exportProgress,
  handleAddText,
}: PlaybackControlsProps) {
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const playbackRate = useManifestStore((state) => state.playbackRate)
  const setPlaybackRate = useManifestStore((state) => state.setPlaybackRate)
  const setItemPlaybackSpeed = useManifestStore((state) => state.setItemPlaybackSpeed)
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
  const updateAudio = useManifestStore((state) => state.updateAudio)
  const removeEffect = useManifestStore((state) => state.removeEffect)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateImage = useManifestStore((state) => state.updateImage)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const texts = useManifestStore((state) => state.texts)
  const audios = useManifestStore((state) => state.audios)

  const selectedVideoId = useSelectionStore((state) => state.selectedVideoId)
  const selectedImageId = useSelectionStore((state) => state.selectedImageId)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const selectedAudioId = useSelectionStore((state) => state.selectedAudioId)
  const selectedEffectId = useSelectionStore((state) => state.selectedEffectId)
  const clearSelection = useSelectionStore((state) => state.clearSelection)

  const selectedAudioMarks = selectedAudioId
    ? audios.find((a) => a.id === selectedAudioId)?.marks.length ?? 0
    : 0

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
            const steps = [0.25, 0.5, 0.75, 1, 1.5, 2]
            const idx = steps.indexOf(playbackRate)
            setPlaybackRate(steps[(idx + 1) % steps.length])
          }}
          title="Global playback speed"
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
          className={styles.addTextButton}
          onClick={handleAddText}
          disabled={videos.filter((v) => !v.isOverlay).length === 0 && images.filter((img) => img.isMainTrack).length === 0}
          title="Add text"
        >
          T
        </button>
        <button
          className={styles.transitionsButton}
          onClick={onOpenEffects}
          title="Effects"
          style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.02em' }}
        >
          Fx
        </button>
        {selectedAudioId && selectedAudioMarks > 0 && (
          <button
            className={styles.clearMarksButton}
            onClick={() => updateAudio(selectedAudioId, { marks: [] })}
            title="Clear marks on selected audio"
          >
            ✕ {selectedAudioMarks}
          </button>
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
