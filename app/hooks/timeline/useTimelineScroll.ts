import { useCallback, useEffect, useRef } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import {
  commitLivePlaybackTimeToStore,
  enablePreviewEngine,
  isTimelinePlayDragRef,
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
const PLAY_DRAG_QUIESCENCE_MS = 150

function scrollLeftToPlaybackTime(
  scrollLeft: number,
  containerWidth: number,
  scrollableWidth: number,
  totalDuration: number,
  effectivePadding: number
): number {
  const centerScrollPosition = scrollLeft + containerWidth / 2
  const scrollPercent = scrollableWidth > 0 ? centerScrollPosition / scrollableWidth : 0
  const totalWithPadding = totalDuration + effectivePadding * 2
  const timeWithPadding = scrollPercent * totalWithPadding
  if (scrollLeft <= 1) return 0
  return Math.max(0, Math.min(totalDuration, timeWithPadding - effectivePadding))
}

function playbackTimeToScrollLeft(
  time: number,
  containerWidth: number,
  scrollableWidth: number,
  totalDuration: number,
  effectivePadding: number
): number {
  const timeWithPadding = time + effectivePadding
  const totalWithPadding = totalDuration + effectivePadding * 2
  const targetScrollPercent = totalWithPadding > 0 ? timeWithPadding / totalWithPadding : 0
  return Math.max(0, scrollableWidth * targetScrollPercent - containerWidth / 2)
}

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
  const playDragPointerDownRef = useRef(false)
  const playDragQuiescenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasPlayingBeforePlayDragRef = useRef(false)
  const totalDurationRef = useRef(totalDuration)
  const effectivePaddingRef = useRef(effectivePadding)

  totalDurationRef.current = totalDuration
  effectivePaddingRef.current = effectivePadding

  const readPlaybackTimeFromContainer = useCallback((container: HTMLDivElement) => {
    return scrollLeftToPlaybackTime(
      container.scrollLeft,
      container.clientWidth,
      container.scrollWidth,
      totalDurationRef.current,
      effectivePaddingRef.current
    )
  }, [])

  const syncScrollToPlaybackTime = useCallback(
    (time: number) => {
      const container = scrollContainerRef.current
      if (!container) return
      isScrollingProgrammatically.current = true
      container.scrollLeft = playbackTimeToScrollLeft(
        time,
        container.clientWidth,
        container.scrollWidth,
        totalDurationRef.current,
        effectivePaddingRef.current
      )
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingProgrammatically.current = false
      }, 50)
    },
    [scrollContainerRef]
  )

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

  const endPlayDrag = useCallback(() => {
    if (!isTimelinePlayDragRef.current) return
    isTimelinePlayDragRef.current = false
    isTimelineScrubbingRef.current = false
    if (playDragQuiescenceTimeoutRef.current) {
      clearTimeout(playDragQuiescenceTimeoutRef.current)
      playDragQuiescenceTimeoutRef.current = null
    }
    const container = scrollContainerRef.current
    const state = useManifestStore.getState()
    if (container) {
      const newTime = readPlaybackTimeFromContainer(container)
      setLivePlaybackTime(newTime)
      state.setPlaybackTime(newTime)
    }
    const resume = wasPlayingBeforePlayDragRef.current
    wasPlayingBeforePlayDragRef.current = false
    if (resume) {
      state.setIsPlaying(true)
    }
    wakePreviewLoop()
    requestPreviewVideoPoolPurge()
  }, [scrollContainerRef, readPlaybackTimeFromContainer])

  const schedulePlayDragQuiescenceEnd = useCallback(() => {
    if (playDragQuiescenceTimeoutRef.current) {
      clearTimeout(playDragQuiescenceTimeoutRef.current)
    }
    playDragQuiescenceTimeoutRef.current = setTimeout(() => {
      playDragQuiescenceTimeoutRef.current = null
      if (!playDragPointerDownRef.current) {
        endPlayDrag()
      }
    }, PLAY_DRAG_QUIESCENCE_MS)
  }, [endPlayDrag])

  const beginPlayDrag = useCallback(() => {
    const state = useManifestStore.getState()
    if (state.isPlaying) {
      wasPlayingBeforePlayDragRef.current = true
      state.setIsPlaying(false)
    }
    isTimelinePlayDragRef.current = true
    isTimelineScrubbingRef.current = true
  }, [])

  const handlePlayDragScroll = useCallback(
    (container: HTMLDivElement) => {
      const newTime = readPlaybackTimeFromContainer(container)
      setLivePlaybackTime(newTime)
      wakePreviewLoop()
      schedulePlayDragQuiescenceEnd()
    },
    [readPlaybackTimeFromContainer, schedulePlayDragQuiescenceEnd]
  )

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current) return
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current

    if (isTimelinePlayDragRef.current) {
      handlePlayDragScroll(container)
      return
    }

    if (useManifestStore.getState().isPlaying) {
      beginPlayDrag()
      handlePlayDragScroll(container)
      return
    }

    if (isPlaying) return

    const newTime = readPlaybackTimeFromContainer(container)

    pendingScrollTimeRef.current = newTime
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(flushScrollPlaybackTime)
    }
  }, [
    isPlaying,
    flushScrollPlaybackTime,
    scrollContainerRef,
    readPlaybackTimeFromContainer,
    handlePlayDragScroll,
    beginPlayDrag,
  ])

  useEffect(() => {
    const onPointerDown = () => {
      playDragPointerDownRef.current = true
    }
    const onPointerUp = () => {
      playDragPointerDownRef.current = false
      endPlayDrag()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [endPlayDrag])

  useEffect(() => {
    if (playbackFromUserScrollRef.current) {
      playbackFromUserScrollRef.current = false
      return
    }
    if (isTimelinePlayDragRef.current) return
    if (!scrollContainerRef.current) return

    syncScrollToPlaybackTime(playbackTime)
  }, [playbackTime, syncScrollToPlaybackTime, scrollContainerRef])

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
      if (playDragQuiescenceTimeoutRef.current) {
        clearTimeout(playDragQuiescenceTimeoutRef.current)
      }
      if (isTimelineScrubbingRef.current) {
        isTimelineScrubbingRef.current = false
        commitLivePlaybackTimeToStore()
        requestPreviewVideoPoolPurge()
      }
      if (isTimelinePlayDragRef.current) {
        isTimelinePlayDragRef.current = false
        wasPlayingBeforePlayDragRef.current = false
      }
    }
  }, [])

  return { handleScroll, isScrollingProgrammatically }
}
