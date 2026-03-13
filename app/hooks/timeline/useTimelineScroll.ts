import { useCallback, useEffect, useRef } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useAudioStore } from '@/app/stores/audioStore'

interface UseTimelineScrollProps {
  scrollContainerRef: React.RefObject<HTMLDivElement>
  totalDuration: number
  effectivePadding: number
  isPlaying: boolean
  selectedAudioId: string | null
  playbackTime: number
  setPlaybackTime: (time: number) => void
}

export function useTimelineScroll({
  scrollContainerRef,
  totalDuration,
  effectivePadding,
  isPlaying,
  selectedAudioId,
  playbackTime,
  setPlaybackTime,
}: UseTimelineScrollProps) {
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollGestureActiveRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapStateRef = useRef<{ dropTime: number } | null>(null)
  const prevRawTimeRef = useRef<number | null>(null)
  const lastReleasedDropRef = useRef<number | null>(null)

  const audioAnalysis = useAudioStore((state) => state.analysis)
  const userMarks = useAudioStore((state) => state.userMarks)

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || isPlaying) return
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    const scrollLeft = container.scrollLeft

    const centerScrollPosition = scrollLeft + (containerWidth / 2)
    const scrollPercent = scrollableWidth > 0 ? centerScrollPosition / scrollableWidth : 0
    const totalWithPadding = totalDuration + effectivePadding * 2
    const timeWithPadding = scrollPercent * totalWithPadding
    let newTime = Math.max(0, Math.min(totalDuration, timeWithPadding - effectivePadding))

    const rawTime = newTime

    const isNewGesture = !scrollGestureActiveRef.current
    scrollGestureActiveRef.current = true
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    scrollEndTimerRef.current = setTimeout(() => {
      scrollGestureActiveRef.current = false
    }, 150)

    if (selectedAudioId && audioAnalysis && userMarks.length > 0) {
      if (snapStateRef.current) {
        if (isNewGesture) {
          lastReleasedDropRef.current = snapStateRef.current.dropTime
          snapStateRef.current = null
        } else {
          newTime = snapStateRef.current.dropTime
          const snapTimeWithPadding = snapStateRef.current.dropTime + effectivePadding
          const targetSnapLeft = totalWithPadding > 0
            ? (scrollableWidth * (snapTimeWithPadding / totalWithPadding)) - (containerWidth / 2)
            : 0
          isScrollingProgrammatically.current = true
          container.scrollLeft = Math.max(0, targetSnapLeft)
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
          scrollTimeoutRef.current = setTimeout(() => {
            isScrollingProgrammatically.current = false
          }, 50)
        }
      }

      if (!snapStateRef.current) {
        const prev = prevRawTimeRef.current
        prevRawTimeRef.current = rawTime
        if (lastReleasedDropRef.current !== null && Math.abs(rawTime - lastReleasedDropRef.current) > 0.3) {
          lastReleasedDropRef.current = null
        }
        if (prev !== null) {
          const lookahead = 0.15
          const direction = rawTime >= prev ? 1 : -1
          const lo = Math.min(prev, rawTime) - (direction < 0 ? lookahead : 0)
          const hi = Math.max(prev, rawTime) + (direction > 0 ? lookahead : 0)
          let crossed: number | null = null
          let crossedDist = Infinity
          for (const drop of userMarks) {
            if (drop === lastReleasedDropRef.current) continue
            if (drop > lo && drop <= hi) {
              const d = Math.abs(drop - prev)
              if (d < crossedDist) { crossedDist = d; crossed = drop }
            }
          }
          if (crossed !== null) {
            snapStateRef.current = { dropTime: crossed }
            newTime = crossed
            prevRawTimeRef.current = crossed
            const snapTimeWithPadding = crossed + effectivePadding
            const targetSnapLeft = totalWithPadding > 0
              ? (scrollableWidth * (snapTimeWithPadding / totalWithPadding)) - (containerWidth / 2)
              : 0
            isScrollingProgrammatically.current = true
            container.scrollLeft = Math.max(0, targetSnapLeft)
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
            scrollTimeoutRef.current = setTimeout(() => {
              isScrollingProgrammatically.current = false
            }, 50)
          }
        }
      } else {
        prevRawTimeRef.current = rawTime
      }
    } else {
      snapStateRef.current = null
      prevRawTimeRef.current = rawTime
    }

    setPlaybackTime(newTime)
  }, [isPlaying, totalDuration, effectivePadding, setPlaybackTime, selectedAudioId, audioAnalysis, userMarks, scrollContainerRef])

  useEffect(() => {
    if (selectedAudioId) {
      prevRawTimeRef.current = playbackTime
    } else {
      snapStateRef.current = null
      prevRawTimeRef.current = null
      lastReleasedDropRef.current = null
      scrollGestureActiveRef.current = false
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    }
  }, [selectedAudioId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrollContainerRef.current) return

    isScrollingProgrammatically.current = true

    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const scrollableWidth = container.scrollWidth
    
    const timeWithPadding = playbackTime + effectivePadding
    const totalWithPadding = totalDuration + effectivePadding * 2
    const targetScrollPercent = totalWithPadding > 0 ? timeWithPadding / totalWithPadding : 0
    const targetScrollLeft = (scrollableWidth * targetScrollPercent) - (containerWidth / 2)
    
    container.scrollLeft = Math.max(0, targetScrollLeft)
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 50)
  }, [playbackTime, totalDuration, effectivePadding, scrollContainerRef])

  return { handleScroll, isScrollingProgrammatically }
}
