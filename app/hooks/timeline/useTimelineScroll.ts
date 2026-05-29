import { useCallback, useEffect, useRef } from 'react'
import {
  commitLivePlaybackTimeToStore,
  enablePreviewEngine,
  isTimelineScrubbingRef,
  requestPreviewVideoPoolPurge,
  setLivePlaybackTime,
  wakePreviewLoop,
} from '@/app/lib/playbackClock'

interface UseTimelineScrollProps {
  scrollContainerRef: React.RefObject<HTMLDivElement>
  totalDuration: number
  effectivePadding: number
  isPlaying: boolean
  playbackTime: number
}

const SCRUB_STORE_COMMIT_MS = 120

export function useTimelineScroll({
  scrollContainerRef,
  totalDuration,
  effectivePadding,
  isPlaying,
  playbackTime,
}: UseTimelineScrollProps) {
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playbackFromUserScrollRef = useRef(false)
  const pendingScrollTimeRef = useRef<number | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const scrubCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleScrubStoreCommit = useCallback(() => {
    if (scrubCommitTimeoutRef.current) {
      clearTimeout(scrubCommitTimeoutRef.current)
    }
    scrubCommitTimeoutRef.current = setTimeout(() => {
      scrubCommitTimeoutRef.current = null
      isTimelineScrubbingRef.current = false
      playbackFromUserScrollRef.current = true
      commitLivePlaybackTimeToStore()
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => requestPreviewVideoPoolPurge())
      } else {
        requestPreviewVideoPoolPurge()
      }
    }, SCRUB_STORE_COMMIT_MS)
  }, [])

  const flushScrollPlaybackTime = useCallback(() => {
    scrollRafRef.current = null
    const pending = pendingScrollTimeRef.current
    if (pending === null) return
    pendingScrollTimeRef.current = null
    enablePreviewEngine()
    isTimelineScrubbingRef.current = true
    setLivePlaybackTime(pending)
    wakePreviewLoop()
    scheduleScrubStoreCommit()
  }, [scheduleScrubStoreCommit])

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || isPlaying) return
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    const scrollLeft = container.scrollLeft

    const centerScrollPosition = scrollLeft + containerWidth / 2
    const scrollPercent = scrollableWidth > 0 ? centerScrollPosition / scrollableWidth : 0
    const totalWithPadding = totalDuration + effectivePadding * 2
    const timeWithPadding = scrollPercent * totalWithPadding
    const newTime =
      scrollLeft <= 1
        ? 0
        : Math.max(0, Math.min(totalDuration, timeWithPadding - effectivePadding))

    pendingScrollTimeRef.current = newTime
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(flushScrollPlaybackTime)
    }
  }, [isPlaying, totalDuration, effectivePadding, flushScrollPlaybackTime, scrollContainerRef])

  useEffect(() => {
    if (playbackFromUserScrollRef.current) {
      playbackFromUserScrollRef.current = false
      return
    }
    if (!scrollContainerRef.current) return

    isScrollingProgrammatically.current = true

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth

    const timeWithPadding = playbackTime + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    const targetScrollPercent = totalWithPadding > 0 ? timeWithPadding / totalWithPadding : 0
    const targetScrollLeft = scrollableWidth * targetScrollPercent - containerWidth / 2

    container.scrollLeft = Math.max(0, targetScrollLeft)

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 50)
  }, [playbackTime, totalDuration, effectivePadding, scrollContainerRef])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      if (scrubCommitTimeoutRef.current) {
        clearTimeout(scrubCommitTimeoutRef.current)
      }
      if (isTimelineScrubbingRef.current) {
        isTimelineScrubbingRef.current = false
        commitLivePlaybackTimeToStore()
        requestPreviewVideoPoolPurge()
      }
    }
  }, [])

  return { handleScroll, isScrollingProgrammatically }
}
