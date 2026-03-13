'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { generateVideoThumbnails } from '@/app/lib/mediaUtils'
import { useAudioStore } from '@/app/stores/audioStore'
import styles from './VideoReplaceModal.module.css'

const PIXELS_PER_SECOND = 60

interface Props {
  videoUrl: string
  windowDuration: number
  videoDuration: number
  initialTrimStart?: number
  projectStartTime?: number
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
  projectStartTime,
  confirmLabel = 'Replace',
  isProcessing = false,
  onConfirm,
  onCancel,
}: Props) {
  const [trimStart, setTrimStart] = useState(initialTrimStart)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTrimStart)
  const [containerWidth, setContainerWidth] = useState(0)
  const isScrollingProgrammatically = useRef(false)
  const requestRef = useRef<number>()

  const audioUrl = useAudioStore((state) => state.audioUrl)

  const videoPlayPromiseRef = useRef<Promise<void> | null>(null)
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null)

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
    const video = videoRef.current
    const audio = audioRef.current
    if (!video) {
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    if (!isPlaying) {
      if (audio && !audio.paused) {
        if (audioPlayPromiseRef.current) {
          audioPlayPromiseRef.current.then(() => audio?.pause()).catch(() => {})
        } else {
          audio.pause()
        }
      }
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    const isVideoSeeking = video.seeking
    const vTime = video.currentTime

    // 1. Loop-back detection: increase epsilon to 0.15s to jump BEFORE hitches
    // and only if we aren't already seeking to the start.
    const isAtEnd = vTime >= trimStart + windowDuration - 0.15 || video.ended
    const isWayBeforeStart = vTime < trimStart - 0.3
    
    if (!isVideoSeeking && (isAtEnd || isWayBeforeStart)) {
      video.currentTime = trimStart
      if (audio && projectStartTime !== undefined) {
        audio.currentTime = projectStartTime
        // Use muted to hide the seek stutter instead of pause() 
        // to avoid the 1-second play-promise gap.
        audio.muted = true 
      }
      setCurrentTime(trimStart)
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    // 2. While seeking, stay muted and keep playbar at start
    if (isVideoSeeking) {
      setCurrentTime(trimStart)
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    // 3. Normal playback sync
    setCurrentTime(vTime)

    // Unmute audio now that seek is done
    if (audio && audio.muted) {
      audio.muted = false
    }

    // Ensure video is playing
    if (video.paused && !videoPlayPromiseRef.current) {
      videoPlayPromiseRef.current = video.play()
      videoPlayPromiseRef.current
        .catch(() => {})
        .finally(() => { videoPlayPromiseRef.current = null })
    }
    
    // Sync audio with video
    if (audio && projectStartTime !== undefined) {
      const offsetInClip = vTime - trimStart
      const targetProjectTime = projectStartTime + offsetInClip
      
      if (targetProjectTime >= 0) {
        const drift = Math.abs(audio.currentTime - targetProjectTime)
        // Tight drift correction
        if (drift > 0.1 && !audio.seeking) {
          audio.currentTime = targetProjectTime
        }
        
        if (audio.paused && video.readyState >= 2 && !audioPlayPromiseRef.current) {
          audioPlayPromiseRef.current = audio.play()
          audioPlayPromiseRef.current
            .catch(() => {})
            .finally(() => { audioPlayPromiseRef.current = null })
        }
      } else {
        if (!audio.paused) {
          if (audioPlayPromiseRef.current) {
            audioPlayPromiseRef.current.then(() => audio?.pause()).catch(() => {})
          } else {
            audio.pause()
          }
        }
      }
    }

    requestRef.current = requestAnimationFrame(animate)
  }, [isPlaying, projectStartTime, trimStart, windowDuration])

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
      if (audioRef.current && projectStartTime !== undefined) {
        audioRef.current.currentTime = projectStartTime
      }
    }
  }, [trimStart, isPlaying, projectStartTime])

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
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
      }
    }
  }, [])

  const handlePlayPause = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      if (videoPlayPromiseRef.current) {
        videoPlayPromiseRef.current.then(() => videoRef.current?.pause()).catch(() => {})
      } else {
        videoRef.current.pause()
      }
      
      if (audioRef.current && !audioRef.current.paused) {
        if (audioPlayPromiseRef.current) {
          audioPlayPromiseRef.current.then(() => audioRef.current?.pause()).catch(() => {})
        } else {
          audioRef.current.pause()
        }
      }
    } else {
      if (!videoPlayPromiseRef.current) {
        videoPlayPromiseRef.current = videoRef.current.play()
        videoPlayPromiseRef.current
          .catch(() => {})
          .finally(() => { videoPlayPromiseRef.current = null })
      }
    }
    setIsPlaying(!isPlaying)
  }

  const handleScroll = useCallback(() => {
    if (isPlaying || isScrollingProgrammatically.current || !scrollContainerRef.current) return
    
    const scrollLeft = scrollContainerRef.current.scrollLeft
    const newTrimStart = Math.max(0, Math.min(maxTrimStart, scrollLeft / PIXELS_PER_SECOND))
    
    setTrimStart(newTrimStart)
    if (!isPlaying && videoRef.current) {
      videoRef.current.currentTime = newTrimStart
      setCurrentTime(newTrimStart)
      if (audioRef.current && projectStartTime !== undefined) {
        audioRef.current.currentTime = projectStartTime
      }
    }
  }, [maxTrimStart, isPlaying, projectStartTime])

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (isPlaying) return
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

      if (e.key === ' ') {
        e.preventDefault()
        handlePlayPause()
        return
      }

      if (isPlaying) return

      const step = e.shiftKey ? 1 : 0.1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        container.scrollLeft -= step * PIXELS_PER_SECOND
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        container.scrollLeft += step * PIXELS_PER_SECOND
      }
    }

    document.addEventListener('wheel', handler, { passive: false })
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('wheel', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [handlePlayPause, isPlaying])

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
            onClick={handlePlayPause}
            className={styles.previewVideo}
            muted
            preload="metadata"
          />
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              style={{ display: 'none' }}
              preload="auto"
            />
          )}
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
              style={{ pointerEvents: isPlaying ? 'none' : 'auto' }}
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
