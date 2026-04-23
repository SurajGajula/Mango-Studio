import { useState, useRef, useCallback } from 'react'
import { exportVideo, ExportProgress } from '@/app/lib/videoExporter'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'

export interface TimelineExportResult {
  blob: Blob
  previewUrl: string
  filename: string
}

interface UseTimelineExportProps {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  effects: EffectClass[]
  setIsPlaying: (playing: boolean) => void
}

export function useTimelineExport({
  videos,
  images,
  texts,
  audios,
  effects,
  setIsPlaying,
}: UseTimelineExportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [exportResult, setExportResult] = useState<TimelineExportResult | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)

  const clearPreview = useCallback(() => {
    setExportResult((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }, [])

  const closeExportModal = useCallback(() => {
    exportAbortRef.current?.abort()
    clearPreview()
    setExportProgress(null)
    setExportModalOpen(false)
  }, [clearPreview])

  const handleExport = useCallback(async () => {
    const hasMainContent = videos.filter((v) => v.row === 0).length > 0 || images.filter((img) => img.row === 0).length > 0
    if (isExporting || !hasMainContent) return

    setExportModalOpen(true)
    clearPreview()
    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    const controller = new AbortController()
    exportAbortRef.current = controller

    try {
      const blob = await exportVideo(videos, FIXED_ASPECT_RATIO, setExportProgress, images, texts, effects, controller.signal, audios)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `mango-export-${timestamp}.mp4`
      const previewUrl = URL.createObjectURL(blob)
      setExportResult({ blob, previewUrl, filename })
      setExportProgress(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportProgress({ phase: 'error', progress: 0, message: 'Export cancelled' })
      } else {
        setExportProgress({
          phase: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Export failed',
        })
      }
    } finally {
      exportAbortRef.current = null
      setIsExporting(false)
    }
  }, [videos, images, isExporting, setIsPlaying, texts, audios, effects, clearPreview])

  return {
    isExporting,
    exportProgress,
    exportModalOpen,
    exportResult,
    handleExport,
    closeExportModal,
  }
}
