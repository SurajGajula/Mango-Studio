'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { generateVideoThumbnails } from '@/app/lib/mediaUtils'
import styles from './VideoReplaceModal.module.css'

const PIXELS_PER_SECOND = 60

interface Props {
  videoUrl: string
  windowDuration: number
  videoDuration: number
  initialTrimStart?: number
  confirmLabel?: string
  isProcessing?: boolean
  onConfirm: (trimStart: number) => void
  onCancel: () => void
}

export default function VideoReplaceModal({
  videoUrl,
  windowDuration,
  videoDuration,
  initialTrimStart = 0,
  confirmLabel = 'Replace',
  isProcessing = false,
  onConfirm,
  onCancel,
}: Props) {
  const [trimStart, setTrimStart] = useState(initialTrimStart)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTrimStart)
  const [containerWidth, setContainerWidth] = useState(0)
  const isScrollingProgrammatically = useRef(false)
  const requestRef = useRef<number>()

  const maxTrimStart = Math.max(0, videoDuration - windowDuration)

  // Measure container width
  useEffect(() => {
    if (timelineContainerRef.current) {
      setContainerWidth(timelineContainerRef.current.clientWidth)
      
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width)
        }
      })
      observer.observe(timelineContainerRef.current)
      return () => observer.disconnect()
    }
  }, [])

  const timelineWidth = videoDuration * PIXELS_PER_SECOND
  const activeWindowWidth = windowDuration * PIXELS_PER_SECOND
  const centerOffset = Math.max(0, (containerWidth - activeWindowWidth) / 2)

  // Smoothly update current time during playback
  const animate = useCallback(() => {
    if (videoRef.current && isPlaying) {
      setCurrentTime(videoRef.current.currentTime)
    }
    requestRef.current = requestAnimationFrame(animate)
  }, [isPlaying])

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate)
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [animate])

  // Generate thumbnails for the entire video
  useEffect(() => {
    let isMounted = true
    const fetchThumbnails = async () => {
      setIsLoadingThumbnails(true)
      const seconds: number[] = []
      // Generate a thumbnail every 2 seconds for performance, or every 1s if short
      const step = videoDuration > 60 ? 2 : 1
      for (let s = 0; s <= videoDuration; s += step) {
        seconds.push(s)
      }
      
      const thumbs = await generateVideoThumbnails(videoUrl, seconds, (time, data) => {
        if (isMounted) {
          setThumbnails(prev => {
            const next = new Map(prev)
            next.set(time, data)
            return next
          })
        }
      })
      
      if (isMounted) {
        setIsLoadingThumbnails(false)
      }
    }

    fetchThumbnails()
    return () => { isMounted = false }
  }, [videoUrl, videoDuration])

  // Sync video time with trimStart when it changes
  useEffect(() => {
    if (videoRef.current && !isPlaying) {
      videoRef.current.currentTime = trimStart
    }
  }, [trimStart, isPlaying])

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.focus()
      isScrollingProgrammatically.current = true
      scrollContainerRef.current.scrollLeft = initialTrimStart * PIXELS_PER_SECOND
      setTimeout(() => {
        isScrollingProgrammatically.current = false
      }, 50)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current.load()
      }
    }
  }, [])

  const handlePlayPause = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const current = videoRef.current.currentTime
    // setCurrentTime(current) // Handled by requestAnimationFrame for smoothness
    
    if (current >= trimStart + windowDuration) {
      videoRef.current.currentTime = trimStart
      if (!videoRef.current.paused) videoRef.current.play()
    }
  }

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || !scrollContainerRef.current) return
    
    const scrollLeft = scrollContainerRef.current.scrollLeft
    const newTrimStart = Math.max(0, Math.min(maxTrimStart, scrollLeft / PIXELS_PER_SECOND))
    
    setTrimStart(newTrimStart)
    if (!isPlaying && videoRef.current) {
      videoRef.current.currentTime = newTrimStart
      setCurrentTime(newTrimStart)
    }
  }, [maxTrimStart, isPlaying])

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const container = scrollContainerRef.current
      if (!container || !container.contains(e.target as Node)) return
      
      // We want to handle all wheel events inside the container as horizontal scrolls
      // This includes vertical mouse wheels and trackpad swipes
      if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
        e.preventDefault()
        // If it's mostly vertical, use deltaY. If horizontal, use deltaX.
        // This covers both mouse wheel and trackpad.
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        container.scrollLeft += delta
      }
    }

    const keyHandler = (e: KeyboardEvent) => {
      const container = scrollContainerRef.current
      if (!container) return

      const step = e.shiftKey ? 1 : 0.1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        container.scrollLeft -= step * PIXELS_PER_SECOND
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        container.scrollLeft += step * PIXELS_PER_SECOND
      } else if (e.key === ' ') {
        e.preventDefault()
        handlePlayPause()
      }
    }

    document.addEventListener('wheel', handler, { passive: false })
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('wheel', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [handlePlayPause])

  const totalTimelineWidth = videoDuration * PIXELS_PER_SECOND
  
  // Playhead position relative to the scroll container
  const playheadPosition = currentTime * PIXELS_PER_SECOND

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Select Video Window</h3>
          <p>Choose a {windowDuration.toFixed(1)}s segment from the video.</p>
        </div>

        <div className={styles.videoContainer}>
          <video
            ref={videoRef}
            src={videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = trimStart
                videoRef.current.play()
              }
            }}
            onClick={handlePlayPause}
            className={styles.previewVideo}
          />
          <button className={styles.playButton} onClick={handlePlayPause}>
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        <div className={styles.controls}>
          <div className={styles.sliderLabel}>
            <span>Start: {trimStart.toFixed(1)}s</span>
            <span>End: {(trimStart + windowDuration).toFixed(1)}s</span>
          </div>
          
          <div className={styles.timelineContainer} ref={timelineContainerRef}>
            <div 
              className={styles.scrollContainer} 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              tabIndex={0}
            >
              <div 
                className={styles.thumbnailsWrapper}
                style={{ 
                  paddingLeft: centerOffset,
                  paddingRight: centerOffset 
                }}
              >
                <div 
                  className={styles.thumbnailsContainer}
                  style={{ width: totalTimelineWidth }}
                >
                  {isLoadingThumbnails && thumbnails.size === 0 && (
                    <div className={styles.loadingThumbnails}>Loading thumbnails...</div>
                  )}
                  {Array.from({ length: Math.ceil(videoDuration) }).map((_, i) => {
                    const thumbTimes = Array.from(thumbnails.keys()).sort((a, b) => a - b)
                    if (thumbTimes.length === 0) {
                      return <div key={i} className={styles.thumbnailFrame} style={{ width: PIXELS_PER_SECOND }} />
                    }
                    const closestTime = thumbTimes.reduce((prev, curr) => 
                      Math.abs(curr - i) < Math.abs(prev - i) ? curr : prev, thumbTimes[0])
                    const thumbUrl = thumbnails.get(closestTime)
                    
                    return (
                      <div 
                        key={i} 
                        className={styles.thumbnailFrame}
                        style={{ width: PIXELS_PER_SECOND }}
                      >
                        {thumbUrl && <img src={thumbUrl} alt="" className={styles.thumbnailImg} />}
                      </div>
                    )
                  })}
                  <div 
                    className={styles.playhead} 
                    style={{ transform: `translateX(${playheadPosition}px)` }}
                  />
                </div>
              </div>
            </div>
            <div 
              className={styles.selectionWindow}
              style={{ 
                left: centerOffset,
                width: activeWindowWidth 
              }}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button 
            className={styles.cancelBtn} 
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button 
            className={`${styles.confirmBtn} ${isProcessing ? styles.processing : ''}`} 
            onClick={() => onConfirm(trimStart)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <span className={styles.spinner} />
                Processing...
              </>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
