'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { downloadBlob, ExportProgress } from '@/app/lib/videoExporter'
import { TimelineExportResult } from '@/app/hooks/timeline/useTimelineExport'
import { AspectRatio } from '@/app/stores/manifest/types'
import styles from './ExportModal.module.css'

const RING_RADIUS = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface ExportModalProps {
  open: boolean
  aspectRatio: AspectRatio
  isExporting: boolean
  exportProgress: ExportProgress | null
  exportResult: TimelineExportResult | null
  onClose: () => void
}

export default function ExportModal({
  open,
  aspectRatio,
  isExporting,
  exportProgress,
  exportResult,
  onClose,
}: ExportModalProps) {
  const handleDownload = useCallback(() => {
    if (!exportResult) return
    downloadBlob(exportResult.blob, exportResult.filename)
  }, [exportResult])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const ringOffset = useMemo(() => {
    if (!exportProgress) return RING_CIRCUMFERENCE
    const p = Math.min(100, Math.max(0, exportProgress.progress))
    return RING_CIRCUMFERENCE * (1 - p / 100)
  }, [exportProgress])

  if (!open) return null

  const showError = exportProgress?.phase === 'error'
  const showProgress = isExporting || (exportProgress && !exportResult && !showError)
  const ratioClass = aspectRatio === '9:16' ? styles.ratio916 : styles.ratio169
  const pct = exportProgress ? Math.round(Math.min(100, Math.max(0, exportProgress.progress))) : 0

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-labelledby="export-modal-title"
        aria-modal="true"
      >
        <div className={styles.header}>
          <h2 id="export-modal-title" className={styles.title}>
            Export video
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.previewWrap}>
            <div className={`${styles.videoFrame} ${ratioClass}`}>
              {exportResult ? (
                <video
                  className={styles.previewVideo}
                  src={exportResult.previewUrl}
                  controls
                  playsInline
                />
              ) : showProgress && exportProgress ? (
                <div className={styles.loadingStage}>
                  <div className={styles.ringWrap}>
                    <svg className={styles.progressRing} viewBox="0 0 100 100" aria-hidden>
                      <circle className={styles.progressRingTrack} cx="50" cy="50" r={RING_RADIUS} />
                      <circle
                        className={styles.progressRingFill}
                        cx="50"
                        cy="50"
                        r={RING_RADIUS}
                        style={{
                          strokeDasharray: RING_CIRCUMFERENCE,
                          strokeDashoffset: ringOffset,
                        }}
                      />
                    </svg>
                    <span className={styles.progressPercent}>{pct}%</span>
                  </div>
                  <p className={styles.progressMessage}>{exportProgress.message}</p>
                </div>
              ) : showError && exportProgress ? (
                <div className={styles.errorStage}>
                  <p className={styles.errorMessage}>{exportProgress.message}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {exportResult && (
          <div className={styles.footer}>
            <button type="button" className={styles.downloadBtn} onClick={handleDownload}>
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
