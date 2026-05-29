'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { calculateSourceTime } from '@/app/lib/renderUtils'
import { decodeAudioWaveformPeaks } from '@/app/lib/audioWaveformPeaks'
import styles from './AudioTrimModal.module.css'

const PIXELS_PER_SECOND = 60
const VIRTUALIZATION_BUFFER = 5

interface Props {
  audioUrl: string
  windowDuration: number
  audioDuration: number
  playbackSpeed?: number
  speedStart?: number
  speedEnd?: number
  speedEasing?: 'linear' | 'ease'
  pitch?: number
  initialTrimStart?: number
  onConfirm: (trimStart: number) => void
  onCancel: () => void
}

export default function AudioTrimModal({
  audioUrl,
  windowDuration,
  audioDuration,
  playbackSpeed = 1,
  speedStart,
  speedEnd,
  speedEasing = 'linear',
  pitch = 1,
  initialTrimStart = 0,
  onConfirm,
  onCancel,
}: Props) {
  const [trimStart, setTrimStart] = useState(initialTrimStart)
  const audioRef = useRef<HTMLAudioElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [peaks, setPeaks] = useState<number[]>([])
  const [isLoadingPeaks, setIsLoadingPeaks] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTrimStart)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(initialTrimStart * PIXELS_PER_SECOND)
  const isScrollingProgrammatically = useRef(false)
  const requestRef = useRef<number>()
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null)

  const ps = playbackSpeed
  const ss = speedStart ?? ps
  const se = speedEnd ?? ps
  const previewRate = ps * pitch
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
  const maxTrimStart = Math.max(0, audioDuration - sourceWindowDuration)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = previewRate
    }
  }, [previewRate])

  useEffect(() => {
    if (timelineContainerRef.current) {
      setContainerWidth(timelineContainerRef.current.clientWidth)
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width)
        }
      })
      observer.observe(timelineContainerRef.current)
      return () => observer.disconnect()
    }
  }, [])

  const activeWindowWidth = sourceWindowDuration * PIXELS_PER_SECOND
  const centerOffset = Math.max(0, (containerWidth - activeWindowWidth) / 2)

  const visibleStartSecond = Math.max(0, Math.floor((scrollLeft - centerOffset) / PIXELS_PER_SECOND) - VIRTUALIZATION_BUFFER)
  const visibleEndSecond = Math.min(
    Math.ceil(audioDuration),
    Math.ceil((scrollLeft + containerWidth + centerOffset) / PIXELS_PER_SECOND) + VIRTUALIZATION_BUFFER
  )

  const getPeakForSecond = useCallback(
    (second: number) => {
      if (peaks.length === 0) return 0.2
      const idx = Math.min(peaks.length - 1, Math.max(0, Math.round((second / audioDuration) * (peaks.length - 1))))
      return peaks[idx] ?? 0
    },
    [peaks, audioDuration]
  )

  const peakMax = peaks.length > 0 ? Math.max(...peaks, 0.001) : 1

  const animate = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    if (!isPlaying) {
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    const isAudioSeeking = audio.seeking
    const aTime = audio.currentTime

    const isAtEnd = aTime >= trimStart + sourceWindowDuration - 0.15 || audio.ended
    const isWayBeforeStart = aTime < trimStart - 0.3

    if (!isAudioSeeking && (isAtEnd || isWayBeforeStart)) {
      audio.currentTime = trimStart
      setCurrentTime(trimStart)
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    if (isAudioSeeking) {
      setCurrentTime(trimStart)
      requestRef.current = requestAnimationFrame(animate)
      return
    }

    setCurrentTime(aTime)

    if (audio.paused && !audioPlayPromiseRef.current) {
      audioPlayPromiseRef.current = audio.play()
      audioPlayPromiseRef.current
        .catch(() => {})
        .finally(() => {
          audioPlayPromiseRef.current = null
        })
    }

    requestRef.current = requestAnimationFrame(animate)
  }, [isPlaying, trimStart, sourceWindowDuration])

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate)
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [animate])

  useEffect(() => {
    let isMounted = true
    const loadPeaks = async () => {
      setIsLoadingPeaks(true)
      const barCount = Math.max(60, Math.ceil(audioDuration))
      try {
        const next = await decodeAudioWaveformPeaks(audioUrl, barCount)
        if (isMounted) setPeaks(next)
      } catch (err) {
        console.error(err)
        if (isMounted) setPeaks([])
      } finally {
        if (isMounted) setIsLoadingPeaks(false)
      }
    }
    void loadPeaks()
    return () => {
      isMounted = false
    }
  }, [audioUrl, audioDuration])

  useEffect(() => {
    if (audioRef.current && !isPlaying) {
      audioRef.current.currentTime = trimStart
      setCurrentTime(trimStart)
    }
  }, [trimStart, isPlaying])

  useEffect(() => {
    overlayRef.current?.focus()
    if (scrollContainerRef.current) {
      isScrollingProgrammatically.current = true
      const initialScroll = Math.min(maxTrimStart, initialTrimStart) * PIXELS_PER_SECOND
      scrollContainerRef.current.scrollLeft = initialScroll
      setScrollLeft(initialScroll)
      setTimeout(() => {
        isScrollingProgrammatically.current = false
      }, 50)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
      }
    }
  }, [])

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      if (audioPlayPromiseRef.current) {
        audioPlayPromiseRef.current.then(() => audioRef.current?.pause()).catch(() => {})
      } else {
        audioRef.current.pause()
      }
    } else if (!audioPlayPromiseRef.current) {
      audioRef.current.currentTime = trimStart
      setCurrentTime(trimStart)
      audioPlayPromiseRef.current = audioRef.current.play()
      audioPlayPromiseRef.current
        .catch(() => {})
        .finally(() => {
          audioPlayPromiseRef.current = null
        })
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying, trimStart])

  const handleScroll = useCallback(() => {
    if (isPlaying || !scrollContainerRef.current) return

    const sLeft = scrollContainerRef.current.scrollLeft
    setScrollLeft(sLeft)

    if (isScrollingProgrammatically.current) return

    const newTrimStart = Math.max(0, Math.min(maxTrimStart, sLeft / PIXELS_PER_SECOND))

    setTrimStart(newTrimStart)
    if (!isPlaying && audioRef.current) {
      audioRef.current.currentTime = newTrimStart
      setCurrentTime(newTrimStart)
    }
  }, [maxTrimStart, isPlaying])

  useEffect(() => {
    const root = overlayRef.current
    const container = scrollContainerRef.current
    if (!root || !container) return
    const handler = (e: WheelEvent) => {
      if (isPlaying) return
      if (!(e.target instanceof Element) || !root.contains(e.target)) return
      if (e.target.closest('button')) return
      if (Math.abs(e.deltaY) === 0 && Math.abs(e.deltaX) === 0) return
      e.preventDefault()
      e.stopPropagation()
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      container.scrollLeft += delta
    }
    root.addEventListener('wheel', handler, { passive: false, capture: true })
    return () => root.removeEventListener('wheel', handler, true)
  }, [isPlaying])

  useEffect(() => {
    const root = overlayRef.current
    if (!root) return
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }

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
  }, [handlePlayPause, isPlaying, onCancel])

  const totalTimelineWidth = audioDuration * PIXELS_PER_SECOND
  const playheadPosition = currentTime * PIXELS_PER_SECOND

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="audio-trim-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 id="audio-trim-title">Select Audio Window</h3>
          <p>
            Scroll to choose a {windowDuration.toFixed(1)}s timeline segment; source window {sourceWindowDuration.toFixed(2)}s
            {speedHint}.
          </p>
        </div>

        <audio ref={audioRef} src={audioUrl} preload="auto" style={{ display: 'none' }} />

        <div className={styles.controls}>
          <div className={styles.controlsHeader}>
            <div className={styles.sliderLabel}>
              <span>Start: {trimStart.toFixed(1)}s</span>
              <span>End: {(trimStart + sourceWindowDuration).toFixed(1)}s</span>
            </div>
            <button type="button" className={styles.playButton} onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
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
                  paddingRight: centerOffset,
                }}
              >
                <div className={styles.thumbnailsContainer} style={{ width: totalTimelineWidth }}>
                  {isLoadingPeaks && peaks.length === 0 && (
                    <div className={styles.loadingThumbnails}>Loading waveform…</div>
                  )}
                  {Array.from({ length: Math.ceil(audioDuration) }).map((_, i) => {
                    if (i < visibleStartSecond || i > visibleEndSecond) {
                      return <div key={i} className={styles.thumbnailFrame} style={{ width: PIXELS_PER_SECOND }} />
                    }
                    const peak = getPeakForSecond(i)
                    const barHeight = Math.max(12, (peak / peakMax) * 48)
                    return (
                      <div
                        key={i}
                        className={styles.thumbnailFrame}
                        style={{
                          width: PIXELS_PER_SECOND,
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: '70%',
                            height: barHeight,
                            background: 'linear-gradient(180deg, #aaa 0%, #444 100%)',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    )
                  })}
                  <div className={styles.playhead} style={{ transform: `translateX(${playheadPosition}px)` }} />
                </div>
              </div>
            </div>
            <div
              className={styles.selectionWindow}
              style={{
                left: centerOffset,
                width: activeWindowWidth,
              }}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.confirmBtn} onClick={() => onConfirm(trimStart)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
