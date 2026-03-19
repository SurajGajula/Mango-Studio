import { useCallback, useEffect, useRef } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'

interface UseTimelineScrollProps {
  scrollContainerRef: React.RefObject<HTMLDivElement>
  totalDuration: number
  effectivePadding: number
  isPlaying: boolean
  playbackTime: number
  setPlaybackTime: (time: number) => void
}

export function useTimelineScroll({
  scrollContainerRef,
  totalDuration,
  effectivePadding,
  isPlaying,
  playbackTime,
  setPlaybackTime,
}: UseTimelineScrollProps) {
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

    setPlaybackTime(newTime)
  }, [isPlaying, totalDuration, effectivePadding, setPlaybackTime, scrollContainerRef])

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
