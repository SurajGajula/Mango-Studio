'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { ImageClass } from '@/app/models/ImageClass'
import { exportVideo, downloadBlob, ExportProgress } from '@/app/lib/videoExporter'
import styles from './Timeline.module.css'

type TrimHandle = 'start' | 'end' | null

export default function Timeline() {
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const selectedVideoId = useManifestStore((state) => state.selectedVideoId)
  const setSelectedVideoId = useManifestStore((state) => state.setSelectedVideoId)
  const selectedImageId = useManifestStore((state) => state.selectedImageId)
  const setSelectedImageId = useManifestStore((state) => state.setSelectedImageId)
  const addImage = useManifestStore((state) => state.addImage)
  const removeImage = useManifestStore((state) => state.removeImage)
  const updateImage = useManifestStore((state) => state.updateImage)
  const replaceTargetId = useManifestStore((state) => state.replaceTargetId)
  const setReplaceTargetId = useManifestStore((state) => state.setReplaceTargetId)
  const setPendingPrompt = useManifestStore((state) => state.setPendingPrompt)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const isPlaying = useManifestStore((state) => state.isPlaying)
  const setPlaybackTime = useManifestStore((state) => state.setPlaybackTime)
  const setIsPlaying = useManifestStore((state) => state.setIsPlaying)
  const getTotalDuration = useManifestStore((state) => state.getTotalDuration)
  const trimVideo = useManifestStore((state) => state.trimVideo)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const timelineRowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const overlayInputRef = useRef<HTMLInputElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const trimStartRef = useRef<{
    trimStart: number
    trimEnd: number
    originalDuration: number
    initialMouseX: number
    timelineWidth: number
  } | null>(null)
  const imageDragRef = useRef<{
    initialMouseX: number
    initialStartTime: number
    initialEndTime: number
    timelineWidth: number
  } | null>(null)
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const totalDuration = getTotalDuration()
  const VISIBLE_DURATION = 8
  const PADDING_DURATION = 4
  const totalTimelineWidth = totalDuration > 0 ? ((totalDuration + PADDING_DURATION * 2) / VISIBLE_DURATION) * 100 : 100

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getContentPosition = (time: number) => {
    const timeWithPadding = time + PADDING_DURATION
    const totalWithPadding = totalDuration + PADDING_DURATION * 2
    if (totalWithPadding === 0) return 0
    return (timeWithPadding / totalWithPadding) * 100
  }

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || isPlaying) return
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    const scrollLeft = container.scrollLeft

    const centerScrollPosition = scrollLeft + (containerWidth / 2)
    const scrollPercent = scrollableWidth > 0 ? centerScrollPosition / scrollableWidth : 0
    const totalWithPadding = totalDuration + PADDING_DURATION * 2
    const timeWithPadding = scrollPercent * totalWithPadding
    const newTime = Math.max(0, Math.min(totalDuration, timeWithPadding - PADDING_DURATION))

    setPlaybackTime(newTime)
  }, [isPlaying, totalDuration, setPlaybackTime])

  useEffect(() => {
    if (!scrollContainerRef.current) return
    
    isScrollingProgrammatically.current = true
    
    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    
    const timeWithPadding = playbackTime + PADDING_DURATION
    const totalWithPadding = totalDuration + PADDING_DURATION * 2
    const targetScrollPercent = totalWithPadding > 0 ? timeWithPadding / totalWithPadding : 0
    const targetScrollLeft = (scrollableWidth * targetScrollPercent) - (containerWidth / 2)
    
    container.scrollLeft = Math.max(0, targetScrollLeft)
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 50)
  }, [playbackTime, totalDuration, isPlaying])

  const handleExport = async () => {
    if (isExporting || videos.length === 0) return

    setIsPlaying(false)
    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 0, message: 'Starting export...' })

    try {
      const blob = await exportVideo(videos, aspectRatio, setExportProgress, images)
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

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        const url = URL.createObjectURL(file)
        const image = new ImageClass(
          `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file.name,
          url,
          playbackTime,
          Math.min(playbackTime + 5, totalDuration || 5),
          50,
          50,
          200,
          200,
          1
        )
        addImage(image)
      }
      reader.readAsDataURL(file)
    })

    e.target.value = ''
  }

  const handleImageDragStart = (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const image = images.find((o) => o.id === imageId)
    if (!image || !timelineRowRef.current) return

    setImageDragging({ imageId, handle })
    imageDragRef.current = {
      initialMouseX: e.clientX,
      initialStartTime: image.startTime,
      initialEndTime: image.endTime,
      timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
    }
  }

  const handleImageDragMove = useCallback((e: MouseEvent) => {
    if (!imageDragging || !imageDragRef.current) return

    const { imageId, handle } = imageDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = imageDragRef.current

    const mouseDelta = e.clientX - initialMouseX
    const timeDelta = (mouseDelta / timelineWidth) * totalDuration

    if (handle === 'move') {
      let newStartTime = initialStartTime + timeDelta
      let newEndTime = initialEndTime + timeDelta
      const duration = initialEndTime - initialStartTime

      if (newStartTime < 0) {
        newStartTime = 0
        newEndTime = duration
      }
      if (newEndTime > totalDuration) {
        newEndTime = totalDuration
        newStartTime = totalDuration - duration
      }

      updateImage(imageId, { startTime: newStartTime, endTime: newEndTime })
    } else if (handle === 'start') {
      let newStartTime = initialStartTime + timeDelta
      newStartTime = Math.max(0, Math.min(newStartTime, initialEndTime - 0.5))
      updateImage(imageId, { startTime: newStartTime })
    } else if (handle === 'end') {
      let newEndTime = initialEndTime + timeDelta
      newEndTime = Math.max(initialStartTime + 0.5, Math.min(newEndTime, totalDuration))
      updateImage(imageId, { endTime: newEndTime })
    }
  }, [imageDragging, totalDuration, updateImage])

  const handleImageDragEnd = useCallback(() => {
    setImageDragging(null)
    imageDragRef.current = null
  }, [])

  useEffect(() => {
    if (!imageDragging) return

    document.addEventListener('mousemove', handleImageDragMove)
    document.addEventListener('mouseup', handleImageDragEnd)

    return () => {
      document.removeEventListener('mousemove', handleImageDragMove)
      document.removeEventListener('mouseup', handleImageDragEnd)
    }
  }, [imageDragging, handleImageDragMove, handleImageDragEnd])

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
            <input
              ref={overlayInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageFileSelect}
              style={{ display: 'none' }}
            />
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
                className={styles.addOverlayButton}
                onClick={() => overlayInputRef.current?.click()}
                title="Add overlay image"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
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
              <div className={styles.playheadLine} />
              <div ref={scrollContainerRef} className={styles.scrollContainer} onScroll={handleScroll}>
                <div className={styles.timelineContent} style={{ width: `${totalTimelineWidth}%` }}>
                  <div className={styles.overlayRow}>
                    {images.map((image) => {
                      const leftPercent = getContentPosition(image.startTime)
                      const widthPercent = totalDuration > 0 ? (image.duration / (totalDuration + PADDING_DURATION * 2)) * 100 : 0
                      const isSelected = selectedImageId === image.id
                      return (
                        <div
                          key={image.id}
                          className={`${styles.overlayItem} ${isSelected ? styles.selected : ''}`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            position: 'absolute',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedImageId(selectedImageId === image.id ? null : image.id)
                            setSelectedVideoId(null)
                          }}
                          onMouseDown={(e) => handleImageDragStart(image.id, 'move', e)}
                        >
                          {isSelected && (
                            <>
                              <div
                                className={styles.overlayHandleStart}
                                onMouseDown={(e) => handleImageDragStart(image.id, 'start', e)}
                              />
                              <div
                                className={styles.overlayHandleEnd}
                                onMouseDown={(e) => handleImageDragStart(image.id, 'end', e)}
                              />
                              <button
                                className={styles.removeOverlayButton}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeImage(image.id)
                                }}
                                title="Remove image"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </>
                          )}
                          <div className={styles.overlayBox}>
                            <img src={image.url} alt={image.name} className={styles.overlayThumbnail} />
                            <span className={styles.overlayName}>{image.name}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div ref={timelineRowRef} className={styles.timelineRow}>
                    {videos.map((video) => {
                      const leftPercent = getContentPosition(video.timestamp)
                      const widthPercent = totalDuration > 0 && video.duration ? (video.duration / (totalDuration + PADDING_DURATION * 2)) * 100 : 0
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
                            setSelectedImageId(null)
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
                          <button
                            className={`${styles.copyPromptButton} ${!video.prompt ? styles.disabled : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (video.prompt) {
                                setPendingPrompt(video.prompt)
                              }
                            }}
                            title={video.prompt ? 'Use this prompt' : 'No prompt available'}
                            disabled={!video.prompt}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
