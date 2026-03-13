import { useState, useRef } from 'react'
import { exportVideo, downloadBlob, ExportProgress } from '@/app/lib/videoExporter'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { AspectRatio } from '@/app/stores/manifest/types'

interface UseTimelineExportProps {
  videos: VideoClass[]
  aspectRatio: AspectRatio
  images: ImageClass[]
  audioUrl: string | null
  texts: TextClass[]
  audios: AudioClass[]
  effects: EffectClass[]
  setIsPlaying: (playing: boolean) => void
}

export function useTimelineExport({
  videos,
  aspectRatio,
  images,
  audioUrl,
  texts,
  audios,
  effects,
  setIsPlaying,
}: UseTimelineExportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)

  const handleExport = async () => {
    const hasMainContent = videos.filter((v) => !v.isOverlay).length > 0 || images.filter((img) => img.isMainTrack).length > 0
    if (isExporting || !hasMainContent) return

    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    const controller = new AbortController()
    exportAbortRef.current = controller

    try {
      const audioTrimStart = audios[0]?.trimStart ?? 0
      const audioStartTime = audios[0]?.startTime ?? 0
      const blob = await exportVideo(videos, aspectRatio, setExportProgress, images, audioUrl, texts, audioTrimStart, audioStartTime, effects, controller.signal, audios)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadBlob(blob, `mango-export-${timestamp}.mp4`)
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
      setTimeout(() => setExportProgress(null), 3000)
    }
  }

  const handleCancelExport = () => {
    exportAbortRef.current?.abort()
  }

  return { isExporting, exportProgress, handleExport, handleCancelExport, setExportProgress }
}
