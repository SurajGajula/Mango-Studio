import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import {
  commitLivePlaybackTimeToStore,
  enablePreviewEngine,
  isTimelineScrubbingRef,
  livePlaybackTimeRef,
  requestPreviewVideoPoolPurge,
  setLivePlaybackTime,
  wakePreviewLoop,
} from '@/app/lib/playbackClock'

const SCRUB_STORE_COMMIT_MS = 120
const WHEEL_SCRUB_QUIESCENCE_MS = 150
const WHEEL_SECONDS_PER_DELTA = 0.015

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function usePreviewFullscreen(
  containerRef: RefObject<HTMLDivElement | null>,
  onEnter: () => void
) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const scrubCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelQuiescenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasPlayingBeforeWheelScrubRef = useRef(false)

  const scheduleScrubStoreCommit = useCallback(() => {
    if (scrubCommitTimeoutRef.current) {
      clearTimeout(scrubCommitTimeoutRef.current)
    }
    scrubCommitTimeoutRef.current = setTimeout(() => {
      scrubCommitTimeoutRef.current = null
      isTimelineScrubbingRef.current = false
      commitLivePlaybackTimeToStore()
      requestPreviewVideoPoolPurge()
    }, SCRUB_STORE_COMMIT_MS)
  }, [])

  const scrubTo = useCallback((time: number) => {
    const totalDuration = useManifestStore.getState().getTotalDuration()
    const clamped = Math.max(0, Math.min(totalDuration, time))
    enablePreviewEngine()
    isTimelineScrubbingRef.current = true
    setLivePlaybackTime(clamped)
    wakePreviewLoop()
    scheduleScrubStoreCommit()
  }, [scheduleScrubStoreCommit])

  const togglePlayPause = useCallback(() => {
    const state = useManifestStore.getState()
    state.setIsPlaying(!state.isPlaying)
    wakePreviewLoop()
  }, [])

  useEffect(() => {
    const syncFullscreenState = () => {
      const active = document.fullscreenElement === containerRef.current
      setIsFullscreen(active)
      if (active) {
        onEnter()
        containerRef.current?.focus()
      }
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [containerRef, onEnter])

  useEffect(() => {
    if (!isFullscreen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      if (e.key === ' ') {
        e.preventDefault()
        togglePlayPause()
        return
      }

      if (useManifestStore.getState().isPlaying) return

      const step = e.shiftKey ? 1 : 0.1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        scrubTo(useManifestStore.getState().playbackTime - step)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        scrubTo(useManifestStore.getState().playbackTime + step)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen, scrubTo, togglePlayPause])

  useEffect(() => {
    if (!isFullscreen) return

    const container = containerRef.current
    if (!container) return

    const endWheelScrub = () => {
      if (wheelQuiescenceTimeoutRef.current) {
        clearTimeout(wheelQuiescenceTimeoutRef.current)
        wheelQuiescenceTimeoutRef.current = null
      }
      isTimelineScrubbingRef.current = false
      commitLivePlaybackTimeToStore()
      requestPreviewVideoPoolPurge()
      if (wasPlayingBeforeWheelScrubRef.current) {
        wasPlayingBeforeWheelScrubRef.current = false
        useManifestStore.getState().setIsPlaying(true)
        wakePreviewLoop()
      }
    }

    const scheduleWheelScrubEnd = () => {
      if (wheelQuiescenceTimeoutRef.current) {
        clearTimeout(wheelQuiescenceTimeoutRef.current)
      }
      wheelQuiescenceTimeoutRef.current = setTimeout(() => {
        wheelQuiescenceTimeoutRef.current = null
        endWheelScrub()
      }, WHEEL_SCRUB_QUIESCENCE_MS)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const state = useManifestStore.getState()
      if (state.isPlaying) {
        wasPlayingBeforeWheelScrubRef.current = true
        state.setIsPlaying(false)
      }
      const delta = e.deltaX + e.deltaY
      scrubTo(livePlaybackTimeRef.current + delta * WHEEL_SECONDS_PER_DELTA)
      scheduleWheelScrubEnd()
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
      if (scrubCommitTimeoutRef.current) {
        clearTimeout(scrubCommitTimeoutRef.current)
        scrubCommitTimeoutRef.current = null
      }
      if (wheelQuiescenceTimeoutRef.current) {
        clearTimeout(wheelQuiescenceTimeoutRef.current)
        wheelQuiescenceTimeoutRef.current = null
      }
      if (wasPlayingBeforeWheelScrubRef.current) {
        wasPlayingBeforeWheelScrubRef.current = false
      }
      if (isTimelineScrubbingRef.current) {
        isTimelineScrubbingRef.current = false
        commitLivePlaybackTimeToStore()
        requestPreviewVideoPoolPurge()
      }
    }
  }, [isFullscreen, containerRef, scrubTo])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement === container) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen()
    }
  }, [containerRef])

  return { isFullscreen, toggleFullscreen, togglePlayPause }
}
