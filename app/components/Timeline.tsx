'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { exportVideo, downloadBlob, ExportProgress } from '@/app/lib/videoExporter'
import styles from './Timeline.module.css'

type TrimHandle = 'start' | 'end' | null

export default function Timeline() {
  const videos = useManifestStore((state) => state.videos)
  const selectedVideoId = useManifestStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useManifestStore((state) => state.setSelectedVideoId)
  const replaceTargetId = useManifestStore((state) => state.replaceTargetId)
  const setReplaceTargetId = useManifestStore((state) => state.setReplaceTargetId)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const getTotalDuration = useManifestStore((state) => state.getTotalDuration)
  const trimVideo = useManifestStore((state) => state.trimVideo)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineRowRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const trimStartRef = useRef<{
    trimStart: number
    trimEnd: number
    originalDuration: number
    initialMouseX: number
    timelineWidth: number
  } | null>(null)

  const totalDuration = getTotalDuration()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getPlayheadPosition = () => {
    if (totalDuration === 0) return 0
    return (playbackTime / totalDuration) * 100
  }

  const seekToPosition = (clientX: number) => {
    if (!timelineRef.current || totalDuration === 0) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const newTime = percentage * totalDuration
    
    setPlaybackTime(newTime)
    
    const videoAtTime = videos.find((video) => {
      if (!video.duration) return false
      return newTime >= video.timestamp && newTime <= video.timestamp + video.duration
    })
    
    if (videoAtTime && videoAtTime.id !== selectedVideoId) {
      setSelectedVideoId(videoAtTime.id)
    }
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekToPosition(e.clientX)
  }

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    seekToPosition(e.clientX)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleExport = async () => {
    if (isExporting || videos.length === 0) return

    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    try {
      const blob = await exportVideo(videos, aspectRatio, setExportProgress)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadBlob(blob, `mango-export-${timestamp}.mp4`)
    } catch (error) {
      setExportProgress({
        phase: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Export failed',
      })
    } finally {
      setIsExporting(false)
      setTimeout(() => setExportProgress(null), 3000)
    }
  }

  const handleTrimStart = useCallback((videoId: string, handle: TrimHandle, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return

    const rect = timelineRowRef.current.getBoundingClientRect()
    
    setTrimDragging({ videoId, handle })
    trimStartRef.current = {
      trimStart: video.trimStart,
      trimEnd: video.trimEnd,
      originalDuration: video.originalDuration ?? video.duration ?? 0,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
    }
    setIsPlaying(false)
  }, [videos, setIsPlaying])

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimDragging || !timelineRowRef.current || !trimStartRef.current) return

    const video = videos.find((v) => v.id === trimDragging.videoId)
    if (!video) return

    const { originalDuration, trimStart: initialTrimStart, trimEnd: initialTrimEnd, initialMouseX, timelineWidth } = trimStartRef.current
    
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalDuration
    
    const minDuration = 0.5
    const snapThreshold = 0.15

    const currentPlaybackTime = useManifestStore.getState().playbackTime
    const localPlaybackInVideo = currentPlaybackTime - video.timestamp + video.trimStart

    if (trimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime
      
      if (Math.abs(newTrimStart - localPlaybackInVideo) < snapThreshold) {
        newTrimStart = localPlaybackInVideo
      }

      const maxTrimStart = originalDuration - initialTrimEnd - minDuration
      newTrimStart = Math.max(0, Math.min(newTrimStart, maxTrimStart))
      
      const frameTimeInOriginal = localPlaybackInVideo
      
      trimVideo(trimDragging.videoId, newTrimStart, initialTrimEnd)
      
      const updatedVideo = useManifestStore.getState().videos.find((v) => v.id === trimDragging.videoId)
      if (updatedVideo && frameTimeInOriginal >= newTrimStart && frameTimeInOriginal <= originalDuration - initialTrimEnd) {
        const newPlaybackTime = updatedVideo.timestamp + (frameTimeInOriginal - newTrimStart)
        setPlaybackTime(Math.max(0, newPlaybackTime))
      }
    } else if (trimDragging.handle === 'end') {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime
      
      const playbackEndInOriginal = originalDuration - newTrimEnd
      if (Math.abs(playbackEndInOriginal - localPlaybackInVideo) < snapThreshold) {
        newTrimEnd = originalDuration - localPlaybackInVideo
      }
      
      const maxTrimEnd = originalDuration - initialTrimStart - minDuration
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, maxTrimEnd))
      
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
    }
  }, [trimDragging, videos, totalDuration, trimVideo, setPlaybackTime])

  const handleTrimEnd = useCallback(() => {
    setTrimDragging(null)
    trimStartRef.current = null
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      seekToPosition(e.clientX)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, totalDuration, videos, selectedVideoId])

  useEffect(() => {
    if (!trimDragging) return

    document.addEventListener('mousemove', handleTrimMove)
    document.addEventListener('mouseup', handleTrimEnd)

    return () => {
      document.removeEventListener('mousemove', handleTrimMove)
      document.removeEventListener('mouseup', handleTrimEnd)
    }
  }, [trimDragging, handleTrimMove, handleTrimEnd])

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {videos.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No videos yet. Generate a video in the chat to see it here.</p>
          </div>
        ) : (
          <div className={styles.timelineWrapper}>
            <div className={styles.playbackControls}>
              <button
                className={styles.playButton}
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={isExporting}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <span className={styles.timeDisplay}>
                {formatTime(playbackTime)} / {formatTime(totalDuration)}
              </span>
              <button
                className={styles.exportButton}
                onClick={handleExport}
                disabled={isExporting || videos.length === 0}
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
            {exportProgress && (
              <div className={styles.exportProgress}>
                <div 
                  className={styles.exportProgressBar} 
                  style={{ width: `${exportProgress.progress}%` }}
                />
                <span className={styles.exportProgressText}>{exportProgress.message}</span>
              </div>
            )}
            <div className={styles.timelineRowContainer}>
              <div ref={timelineRowRef} className={styles.timelineRow}>
                {videos.map((video) => {
                  const leftPercent = totalDuration > 0 ? (video.timestamp / totalDuration) * 100 : 0
                  const widthPercent = totalDuration > 0 && video.duration ? (video.duration / totalDuration) * 100 : 0
                  const isSelected = selectedVideoId === video.id
                  const isReplaceTarget = replaceTargetId === video.id
                  const hasTrim = video.trimStart > 0 || video.trimEnd > 0
                  return (
                    <div
                      key={video.id}
                      className={`${styles.timelineItem} ${isSelected ? styles.selected : ''} ${hasTrim ? styles.trimmed : ''} ${isReplaceTarget ? styles.replaceTarget : ''}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        position: 'absolute',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedVideoId(video.id)
                      }}
                    >
                      {isSelected && (
                        <>
                          <div
                            className={styles.trimHandleStart}
                            onMouseDown={(e) => handleTrimStart(video.id, 'start', e)}
                          />
                          <div
                            className={styles.trimHandleEnd}
                            onMouseDown={(e) => handleTrimStart(video.id, 'end', e)}
                          />
                          <button
                            className={`${styles.replaceButton} ${isReplaceTarget ? styles.active : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setReplaceTargetId(isReplaceTarget ? null : video.id)
                            }}
                            title={isReplaceTarget ? 'Cancel replace mode' : 'Replace this video'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                            </svg>
                          </button>
                        </>
                      )}
                      <div className={styles.videoBox}>
                        <div className={styles.videoInfo}>
                          <div className={styles.title}>{video.title}</div>
                          {isReplaceTarget && (
                            <div className={styles.replaceIndicator}>Will be replaced</div>
                          )}
                          {hasTrim && !isReplaceTarget && (
                            <div className={styles.trimIndicator}>
                              Trimmed: {video.trimStart.toFixed(1)}s / {video.trimEnd.toFixed(1)}s
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {totalDuration > 0 && (
                <>
                  <div
                    ref={timelineRef}
                    className={styles.playbar}
                    onClick={handleTimelineClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  />
                  <div
                    className={styles.playbarLine}
                    style={{ left: `${getPlayheadPosition()}%` }}
                  />
                  <div
                    className={styles.playhead}
                    style={{ left: `${getPlayheadPosition()}%` }}
                    onMouseDown={handleMouseDown}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
