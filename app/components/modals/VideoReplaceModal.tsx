'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { generateVideoThumbnails } from '@/app/lib/mediaUtils'
import { terminateFFmpeg } from '@/app/lib/videoExporter'
import { calculateSourceTime } from '@/app/lib/renderUtils'
import { AudioClass } from '@/app/models/AudioClass'
import { useAudioStore } from '@/app/stores/audioStore'
import styles from './VideoReplaceModal.module.css'

function projectTimeToAudioSourceTime(projectTime: number, audio: AudioClass): number {
  const elapsed = projectTime - audio.startTime
  const timelineDuration = audio.endTime - audio.startTime
  if (timelineDuration <= 0) return audio.trimStart ?? 0
  const clampedElapsed = Math.max(0, Math.min(elapsed, timelineDuration - 1e-6))
  const sourceTimeOffset = calculateSourceTime(
    clampedElapsed,
    timelineDuration,
    audio.speedStart ?? audio.playbackSpeed ?? 1,
    audio.speedEnd ?? audio.playbackSpeed ?? 1,
    audio.playbackSpeed ?? 1,
    audio.speedEasing ?? 'linear'
  )
  const pitch = audio.pitch ?? 1
  return (audio.trimStart ?? 0) + sourceTimeOffset * pitch
}

function isProjectTimeInAudioClip(projectTime: number, audio: AudioClass): boolean {
  return projectTime >= audio.startTime && projectTime < audio.endTime
}

const PIXELS_PER_SECOND = 60
const VIRTUALIZATION_BUFFER = 5 // Number of extra thumbnails to render on each side

interface Props {
  videoUrl: string
  windowDuration: number
  videoDuration: number
  playbackSpeed?: number
  speedStart?: number
  speedEnd?: number
  speedEasing?: 'linear' | 'ease'
  initialTrimStart?: number
  projectStartTime?: number
  mainAudio?: AudioClass | null
  confirmLabel?: string
  isProcessing?: boolean
  onConfirm: (trimStart: number) => void
  onCancel: () => void
}

export default function VideoReplaceModal({
  videoUrl,
  windowDuration,
  videoDuration,
  playbackSpeed = 1,
  speedStart,
  speedEnd,
  speedEasing = 'linear',
  initialTrimStart = 0,
  projectStartTime,
  mainAudio = null,
  confirmLabel = 'Replace',
  isProcessing = false,
  onConfirm,
  onCancel,
}: Props) {
  const [trimStart, setTrimStart] = useState(initialTrimStart)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTrimStart)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(initialTrimStart * PIXELS_PER_SECOND)
  const isScrollingProgrammatically = useRef(false)
  const requestRef = useRef<number>()

  const audioUrl = useAudioStore((state) => state.audioUrl)

  const videoPlayPromiseRef = useRef<Promise<void> | null>(null)
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null)

  const ps = playbackSpeed
  const ss = speedStart ?? ps
  const se = speedEnd ?? ps
  const sourceWindowDuration = useMemo(
    () => calculateSourceTime(windowDuration, windowDuration, ss, se, ps, speedEasing),
    [windowDuration, ss, se, ps, speedEasing]
  )
  const speedHint =
    Math.abs(ss - 1) < 0.05 && Math.abs(se - 1) < 0.05
      ? ''
      : Math.abs(ss - se) < 0.05
        ? ` (preview ${ss.toFixed(2)}x)`
        : ` (preview ${ss.toFixed(2)}x → ${se.toFixed(2)}x)`
  const maxTrimStart = Math.max(0, videoDuration - sourceWindowDuration)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Memoize sorted thumbnail times for efficient lookup
  const sortedThumbTimes = useMemo(() => {
    return Array.from(thumbnails.keys()).sort((a, b) => a - b)
  }, [thumbnails])

  // Efficiently find the closest thumbnail for any given second
  const getThumbnailForSecond = useCallback((second: number) => {
    if (sortedThumbTimes.length === 0) return null
    
    // Binary search for the closest time would be even faster, but for 
    // a few hundred thumbnails, a simple find/reduce is usually fine if memoized.
    // Let's use a slightly faster approach than reduce for very long videos.
    let closest = sortedThumbTimes[0]
    let minDiff = Math.abs(closest - second)
    
    for (let i = 1; i < sortedThumbTimes.length; i++) {
      const diff = Math.abs(sortedThumbTimes[i] - second)
      if (diff < minDiff) {
        minDiff = diff
        closest = sortedThumbTimes[i]
      } else if (sortedThumbTimes[i] > second) {
        // Since it's sorted, we can stop early
        break
      }
    }
    
    return thumbnails.get(closest)
  }, [sortedThumbTimes, thumbnails])

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
  const activeWindowWidth = sourceWindowDuration * PIXELS_PER_SECOND
  const centerOffset = Math.max(0, (containerWidth - activeWindowWidth) / 2)

  // Virtualization range
  const visibleStartSecond = Math.max(0, Math.floor((scrollLeft - centerOffset) / PIXELS_PER_SECOND) - VIRTUALIZATION_BUFFER)
  const visibleEndSecond = Math.min(Math.ceil(videoDuration), Math.ceil((scrollLeft + containerWidth + centerOffset) / PIXELS_PER_SECOND) + VIRTUALIZATION_BUFFER)

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
    const isAtEnd = vTime >= trimStart + sourceWindowDuration - 0.15 || video.ended
    const isWayBeforeStart = vTime < trimStart - 0.3
    
    if (!isVideoSeeking && (isAtEnd || isWayBeforeStart)) {
      video.currentTime = trimStart
      if (audio && projectStartTime !== undefined) {
        audio.currentTime = mainAudio
          ? projectTimeToAudioSourceTime(projectStartTime, mainAudio)
          : projectStartTime
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
    
    if (audio && projectStartTime !== undefined) {
      const timelineOffset = (vTime - trimStart) / playbackSpeed
      const targetProjectTime = projectStartTime + timelineOffset

      if (mainAudio) {
        if (!isProjectTimeInAudioClip(targetProjectTime, mainAudio)) {
          if (!audio.paused) {
            if (audioPlayPromiseRef.current) {
              audioPlayPromiseRef.current.then(() => audio?.pause()).catch(() => {})
            } else {
              audio.pause()
            }
          }
        } else {
          const targetSourceTime = projectTimeToAudioSourceTime(targetProjectTime, mainAudio)
          const drift = Math.abs(audio.currentTime - targetSourceTime)
          if (drift > 0.25 && !audio.seeking) {
            audio.currentTime = targetSourceTime
          }

          if (audio.paused && video.readyState >= 2 && !audioPlayPromiseRef.current) {
            audioPlayPromiseRef.current = audio.play()
            audioPlayPromiseRef.current
              .catch(() => {})
              .finally(() => { audioPlayPromiseRef.current = null })
          }
        }
      } else if (targetProjectTime >= 0) {
        const drift = Math.abs(audio.currentTime - targetProjectTime)
        if (drift > 0.25 && !audio.seeking) {
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
  }, [isPlaying, projectStartTime, trimStart, sourceWindowDuration, playbackSpeed, mainAudio])

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

  useEffect(() => {
    if (videoRef.current && !isPlaying) {
      videoRef.current.currentTime = trimStart
      if (audioRef.current && projectStartTime !== undefined) {
        audioRef.current.currentTime = mainAudio
          ? projectTimeToAudioSourceTime(projectStartTime, mainAudio)
          : projectStartTime
      }
    }
  }, [trimStart, isPlaying, projectStartTime, mainAudio])

  useEffect(() => {
    overlayRef.current?.focus()
    if (scrollContainerRef.current) {
      isScrollingProgrammatically.current = true
      const initialScroll = initialTrimStart * PIXELS_PER_SECOND
      scrollContainerRef.current.scrollLeft = initialScroll
      setScrollLeft(initialScroll)
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
      // Terminate FFmpeg to free memory when modal unmounts
      terminateFFmpeg()
    }
  }, [])

  const handlePlayPause = useCallback(() => {
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
  }, [isPlaying])

  const handleScroll = useCallback(() => {
    if (isPlaying || !scrollContainerRef.current) return
    
    const sLeft = scrollContainerRef.current.scrollLeft
    setScrollLeft(sLeft)
    
    if (isScrollingProgrammatically.current) return

    const newTrimStart = Math.max(0, Math.min(maxTrimStart, sLeft / PIXELS_PER_SECOND))
    
    setTrimStart(newTrimStart)
    if (!isPlaying && videoRef.current) {
      videoRef.current.currentTime = newTrimStart
      setCurrentTime(newTrimStart)
      if (audioRef.current && projectStartTime !== undefined) {
        audioRef.current.currentTime = mainAudio
          ? projectTimeToAudioSourceTime(projectStartTime, mainAudio)
          : projectStartTime
      }
    }
  }, [maxTrimStart, isPlaying, projectStartTime, mainAudio])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handler = (e: WheelEvent) => {
      if (isPlaying) return
      if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
        e.preventDefault()
        e.stopPropagation()
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        container.scrollLeft += delta
      }
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [isPlaying])

  useEffect(() => {
    const root = overlayRef.current
    if (!root) return
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
    root.addEventListener('keydown', keyHandler)
    return () => root.removeEventListener('keydown', keyHandler)
  }, [handlePlayPause, isPlaying])

  const totalTimelineWidth = videoDuration * PIXELS_PER_SECOND
  
  // Playhead position relative to the scroll container
  const playheadPosition = currentTime * PIXELS_PER_SECOND

  return (
    <div ref={overlayRef} className={styles.overlay} tabIndex={-1}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Select Video Window</h3>
          <p>Choose a {windowDuration.toFixed(1)}s timeline segment; source window {sourceWindowDuration.toFixed(2)}s{speedHint}.</p>
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
            <span>End: {(trimStart + sourceWindowDuration).toFixed(1)}s</span>
          </div>
          
          <div className={styles.timelineContainer} ref={timelineContainerRef}>
            <div
              className={styles.scrollContainer}
              ref={scrollContainerRef}
              onScroll={handleScroll}
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
                    // Virtualization: only render if in range
                    if (i < visibleStartSecond || i > visibleEndSecond) {
                      return <div key={i} className={styles.thumbnailFrame} style={{ width: PIXELS_PER_SECOND }} />
                    }

                    const thumbUrl = getThumbnailForSecond(i)
                    
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
