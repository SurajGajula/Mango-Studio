import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

const MOVE_HOLD_MS = 280
const HOLD_PREVIEW_MOVE_SLOP_PX = 8
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { useManifestStore } from '@/app/stores/manifestStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'

type TrimHandle = 'start' | 'end' | null

const TIMELINE_SNAP_REF_VISIBLE_SEC = 8
const TIMELINE_SNAP_BASE_SEC = 0.15
const TIMELINE_SNAP_MIN_SEC = 0.02
const TIMELINE_SNAP_MAX_SEC = 0.25

function timelineSnapThresholdSeconds(visibleDuration: number): number {
  const scaled = TIMELINE_SNAP_BASE_SEC * (visibleDuration / TIMELINE_SNAP_REF_VISIBLE_SEC)
  return Math.max(TIMELINE_SNAP_MIN_SEC, Math.min(TIMELINE_SNAP_MAX_SEC, scaled))
}

interface UseTimelineDragProps {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  totalDuration: number
  effectivePadding: number
  visibleDuration: number
  timelineRowRef: React.RefObject<HTMLDivElement>
  setIsPlaying: (playing: boolean) => void
  trimVideo: (id: string, start: number, end: number, ts?: number) => void
  updateImage: (id: string, updates: Partial<ImageClass>) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  updateText: (id: string, updates: Partial<TextClass>) => void
  updateEffect: (id: string, updates: Partial<EffectClass>) => void
  trimAudio: (id: string, start: number, end: number, ts?: number) => void
  moveItemToRow: (id: string, targetRow: number, newTime?: number) => void
  insertRow: (atIndex: number) => void
  deleteRow: (atIndex: number) => void
  pushHistory: () => void
}

export function useTimelineDrag({
  videos,
  images,
  texts,
  audios,
  totalDuration,
  effectivePadding,
  visibleDuration,
  timelineRowRef,
  setIsPlaying,
  trimVideo,
  updateImage,
  updateVideo,
  updateText,
  updateEffect,
  trimAudio,
  moveItemToRow,
  insertRow,
  deleteRow,
  pushHistory,
}: UseTimelineDragProps) {
  const snapThresholdSec = useMemo(() => timelineSnapThresholdSeconds(visibleDuration), [visibleDuration])

  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [audioTrimDragging, setAudioTrimDragging] = useState<{ audioId: string; handle: 'start' | 'end' } | null>(null)
  const [audioBodyDragging, setAudioBodyDragging] = useState<{ audioId: string } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const [overlayVideoDragging, setOverlayVideoDragging] = useState<{ videoId: string } | null>(null)
  const [textDragging, setTextDragging] = useState<{ textId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  const [effectDragging, setEffectDragging] = useState<{ effectId: string; handle: 'move' | 'start' | 'end' } | null>(null)
  type ActiveDragState = {
    itemId: string
    itemType: 'video' | 'image' | 'text' | 'audio' | 'effect'
    handle: 'move' | 'start' | 'end'
    initialStartTime: number
    initialRow: number
    duration: number
    pressClientX: number
    pressClientY: number
  }

  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    targetRow: number
    targetTime: number
    isInsertion: boolean
    isValid: boolean
  } | null>(null)
  const [holdDragPreview, setHoldDragPreview] = useState<{
    targetRow: number
    targetTime: number
    isInsertion: boolean
    isValid: boolean
    duration: number
    itemType: ActiveDragState['itemType']
  } | null>(null)

  const trimStartRef = useRef<any>(null)
  const audioTrimRef = useRef<any>(null)
  const audioBodyDragRef = useRef<any>(null)
  const imageDragRef = useRef<any>(null)
  const timelineHandleHistoryPausedRef = useRef(false)
  const overlayVideoDragRef = useRef<any>(null)
  const textDragRef = useRef<any>(null)
  const effectDragRef = useRef<any>(null)
  const holdMoveCleanupRef = useRef<(() => void) | null>(null)

  type ActiveDragDraft = Omit<ActiveDragState, 'pressClientX' | 'pressClientY'>

  useEffect(
    () => () => {
      holdMoveCleanupRef.current?.()
      holdMoveCleanupRef.current = null
    },
    []
  )

  useEffect(
    () => () => {
      if (!timelineHandleHistoryPausedRef.current) return
      const st = useManifestStore.getState()
      st.resumeHistory()
      timelineHandleHistoryPausedRef.current = false
      st.pushHistory()
    },
    []
  )

  const getSnapTargets = useCallback((excludeId?: string) => {
    const targets = new Set<number>()
    targets.add(useManifestStore.getState().playbackTime)
    audios.forEach((a) => {
      a.marks.forEach((m) => {
        targets.add(a.startTime + (m.t - a.trimStart))
      })
    })

    videos.forEach((v) => {
      const start = v.timestamp
      v.keyframes?.forEach((k) => {
        targets.add(start + k.t)
      })
    })
    images.forEach((img) => {
      img.keyframes?.forEach((k) => {
        targets.add(img.startTime + k.t)
      })
    })

    videos.forEach(v => {
      if (v.id !== excludeId) {
        targets.add(v.timestamp)
        targets.add(v.timestamp + (v.duration ?? 0))
      }
    })
    images.forEach(img => {
      if (img.id !== excludeId) {
        targets.add(img.startTime)
        targets.add(img.endTime)
      }
    })
    texts.forEach(t => {
      if (t.id !== excludeId) {
        targets.add(t.startTime)
        targets.add(t.endTime)
      }
    })
    audios.forEach(a => {
      if (a.id !== excludeId) {
        targets.add(a.startTime)
        const activeDur = (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1)
        targets.add(a.startTime + activeDur)
      }
    })
    useManifestStore.getState().effects.forEach(e => {
      if (e.id !== excludeId) {
        targets.add(e.startTime)
        targets.add(e.endTime)
      }
    })
    return Array.from(targets)
  }, [videos, images, texts, audios])

  const computePreviewForDrag = useCallback(
    (
      drag: ActiveDragState,
      clientX: number,
      clientY: number,
      lockTargetRowToInitial?: boolean
    ) => {
      if (!timelineRowRef.current) return null
      const { pressClientX, initialStartTime, duration, itemType, itemId, initialRow } = drag
      const rect = timelineRowRef.current.getBoundingClientRect()
      const timelineWidth = rect.width
      const totalWithPadding = totalDuration + effectivePadding * 2

      const mouseDeltaX = clientX - pressClientX
      const timeDelta = (mouseDeltaX / timelineWidth) * totalWithPadding
      let targetTime = Math.max(0, initialStartTime + timeDelta)
    
    // Snapping
    const targets = getSnapTargets(itemId)
    const snappedTime = snapToMarkers(targetTime, targets, snapThresholdSec)
    if (snappedTime !== targetTime) {
      targetTime = snappedTime
    } else {
      const snappedEnd = snapToMarkers(targetTime + duration, targets, snapThresholdSec)
      if (snappedEnd !== targetTime + duration) {
        targetTime = snappedEnd - duration
      }
    }
    targetTime = Math.max(0, targetTime)

      const container = timelineRowRef.current
      const rowElements = Array.from(container.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.hasAttribute('data-row-index')
      )

      let targetRow = initialRow
      let isInsertion = false
      let isValid = true

      if (lockTargetRowToInitial) {
        targetRow = initialRow
        isInsertion = false
      } else {
        const st = useManifestStore.getState()
        let maxOverlayRow = 0
        const bump = (r: number) => {
          if (r > maxOverlayRow) maxOverlayRow = r
        }
        st.videos.forEach((v) => {
          if (v.row > 0) bump(v.row)
        })
        st.images.forEach((img) => {
          if (img.row > 0) bump(img.row)
        })
        st.texts.forEach((t) => {
          if (t.row > 0) bump(t.row)
        })
        st.audios.forEach((a) => {
          if (a.row > 0) bump(a.row)
        })
        st.effects.forEach((e) => {
          if (e.row > 0) bump(e.row)
        })

        const overlayVisualItem =
          itemType === 'image' ||
          itemType === 'video' ||
          itemType === 'text' ||
          itemType === 'effect'
        const canUseTopOverlayAudioLane = itemType === 'audio' && initialRow >= 1

        let foundRow = false
        const y = clientY

        const firstRow = rowElements[0]
        if (firstRow) {
          const firstRowRect = firstRow.getBoundingClientRect()
          if (y < firstRowRect.top) {
            const firstRowIndexAttr = firstRow.getAttribute('data-row-index')
            if (firstRowIndexAttr) {
              const firstIdx = parseInt(firstRowIndexAttr)
              if (firstIdx !== -1) {
                targetRow = firstIdx + 1
                isInsertion = true
                foundRow = true
              } else if (itemType === 'audio' && initialRow === 0) {
                targetRow = 0
                foundRow = true
              } else if (overlayVisualItem || canUseTopOverlayAudioLane) {
                targetRow = maxOverlayRow + 1
                isInsertion = false
                foundRow = true
              }
            }
          }
        }

        if (!foundRow) {
          for (let i = 0; i < rowElements.length; i++) {
            const row = rowElements[i]
            const rowRect = row.getBoundingClientRect()
            const rowIndexAttr = row.getAttribute('data-row-index')
            const rowIndex = rowIndexAttr ? parseInt(rowIndexAttr) : -1

            if (y >= rowRect.top && y <= rowRect.bottom) {
              if (rowIndex === -1 && itemType === 'audio') {
                targetRow = 0
                foundRow = true
                break
              }
              if (rowIndex === -1 && overlayVisualItem) {
                targetRow = maxOverlayRow + 1
                isInsertion = false
                foundRow = true
                break
              }
              if (rowIndex !== -1) {
                targetRow = rowIndex
                foundRow = true
                break
              }
            }

            if (i < rowElements.length - 1) {
              const nextRow = rowElements[i + 1]
              const nextRowRect = nextRow.getBoundingClientRect()
              if (y > rowRect.bottom && y < nextRowRect.top) {
                const nextRowIndexAttr = nextRow.getAttribute('data-row-index')
                if (nextRowIndexAttr) {
                  const nextIdx = parseInt(nextRowIndexAttr)
                  if (nextIdx !== -1) {
                    targetRow = nextIdx + 1
                    isInsertion = true
                    foundRow = true
                    break
                  }
                }
              }
            }
          }
        }

        if (!foundRow) {
          const firstUnified = rowElements.find((el) => {
            const a = el.getAttribute('data-row-index')
            return a !== null && parseInt(a, 10) > 0
          })
          if ((overlayVisualItem || canUseTopOverlayAudioLane) && firstUnified) {
            const ur = firstUnified.getBoundingClientRect()
            if (y < ur.top) {
              targetRow = maxOverlayRow + 1
              isInsertion = false
              foundRow = true
            }
          }
        }

        if (!foundRow) {
          targetRow = initialRow
        }
      }

      if (
        !lockTargetRowToInitial &&
        (itemType === 'text' || itemType === 'effect') &&
        targetRow === 0
      ) {
        targetRow = findFreeVisualOverlayRow(targetTime, targetTime + duration)
        isInsertion = false
      }

      const myStart = targetTime
      const myEnd = targetTime + duration
      const threshold = 0.01

      if (!isInsertion && targetRow !== 0 && targetRow !== -1 && itemType !== 'audio') {
        const itemsOnRow = [
          ...videos.filter((v) => v.row === targetRow && v.id !== itemId).map((v) => ({ start: v.timestamp, end: v.timestamp + (v.duration ?? 0) })),
          ...images.filter((img) => img.row === targetRow && img.id !== itemId).map((img) => ({ start: img.startTime, end: img.endTime })),
          ...texts.filter((t) => t.row === targetRow && t.id !== itemId).map((t) => ({ start: t.startTime, end: t.endTime })),
          ...audios.filter((a) => a.row === targetRow && a.id !== itemId).map((a) => {
            const activeDur = (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1)
            return { start: a.startTime, end: a.startTime + activeDur }
          }),
          ...useManifestStore.getState().effects.filter((e) => e.row === targetRow && e.id !== itemId).map((e) => ({ start: e.startTime, end: e.endTime })),
        ]

        for (const other of itemsOnRow) {
          if (myStart < other.end - threshold && myEnd > other.start + threshold) {
            isValid = false
            break
          }
        }
      }

      if (!isInsertion && itemType === 'audio' && targetRow >= 0) {
        for (const a of audios) {
          if (a.id === itemId || a.row !== targetRow) continue
          const activeDur = (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1)
          const oStart = a.startTime
          const oEnd = a.startTime + activeDur
          if (myStart < oEnd - threshold && myEnd > oStart + threshold) {
            isValid = false
            break
          }
        }
      }

      if (!isInsertion && targetRow >= 1) {
        const st = useManifestStore.getState()
        const otherAudiosOnRow = st.audios.filter((a) => a.row === targetRow && a.id !== itemId)
        const otherVisualOnRow =
          st.videos.some((v) => v.row === targetRow && v.isOverlay && v.id !== itemId) ||
          st.images.some(
            (img) => img.row === targetRow && !img.isMainTrack && img.id !== itemId
          ) ||
          st.texts.some((t) => t.row === targetRow && t.id !== itemId) ||
          st.effects.some((e) => e.row === targetRow && e.id !== itemId)
        if (itemType === 'audio') {
          if (otherVisualOnRow) isValid = false
        } else if (
          itemType === 'image' ||
          itemType === 'video' ||
          itemType === 'text' ||
          itemType === 'effect'
        ) {
          if (otherAudiosOnRow.length > 0) isValid = false
        }
      }

      return { targetRow, targetTime, isInsertion, isValid }
    },
    [timelineRowRef, totalDuration, effectivePadding, snapThresholdSec, getSnapTargets, videos, images, texts, audios]
  )

  const calculateDragState = useCallback(
    (e: MouseEvent) => {
      if (!activeDrag) return null
      return computePreviewForDrag(activeDrag, e.clientX, e.clientY, false)
    },
    [activeDrag, computePreviewForDrag]
  )

  const scheduleHoldMoveDrag = useCallback(
    (e: React.MouseEvent, getDraft: () => ActiveDragDraft | null) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      holdMoveCleanupRef.current?.()
      holdMoveCleanupRef.current = null

      const pressClientX = e.clientX
      const pressClientY = e.clientY
      let cancelled = false
      const pointer = { x: e.clientX, y: e.clientY }
      let timer: number | undefined
      let holdPreviewAllowed = false

      const flushHoldPreview = () => {
        if (!timelineRowRef.current) return
        const draft = getDraft()
        if (!draft) {
          setHoldDragPreview(null)
          return
        }
        const drag: ActiveDragState = { ...draft, pressClientX, pressClientY }
        const preview = computePreviewForDrag(drag, pointer.x, pointer.y, true)
        if (preview) {
          setHoldDragPreview({
            ...preview,
            duration: draft.duration,
            itemType: draft.itemType,
          })
        } else {
          setHoldDragPreview(null)
        }
      }

      const onPointerMove = (ev: MouseEvent) => {
        pointer.x = ev.clientX
        pointer.y = ev.clientY
        if (!holdPreviewAllowed) {
          const dx = ev.clientX - pressClientX
          const dy = ev.clientY - pressClientY
          if (dx * dx + dy * dy >= HOLD_PREVIEW_MOVE_SLOP_PX * HOLD_PREVIEW_MOVE_SLOP_PX) {
            holdPreviewAllowed = true
          }
        }
        if (holdPreviewAllowed) {
          flushHoldPreview()
        }
      }
      const finishCleanup = () => {
        if (cancelled) return
        cancelled = true
        if (timer !== undefined) clearTimeout(timer)
        document.removeEventListener('mousemove', onPointerMove)
        document.removeEventListener('mouseup', onPointerUp)
        holdMoveCleanupRef.current = null
        setHoldDragPreview(null)
      }
      const onPointerUp = () => finishCleanup()

      timer = window.setTimeout(() => {
        if (cancelled) return
        cancelled = true
        if (timer !== undefined) clearTimeout(timer)
        document.removeEventListener('mousemove', onPointerMove)
        document.removeEventListener('mouseup', onPointerUp)
        holdMoveCleanupRef.current = null
        setHoldDragPreview(null)
        const draft = getDraft()
        if (!draft || !timelineRowRef.current) return
        const drag: ActiveDragState = { ...draft, pressClientX, pressClientY }
        setActiveDrag(drag)
        const preview = computePreviewForDrag(drag, pointer.x, pointer.y, false)
        if (preview) setDragPreview(preview)
        setIsPlaying(false)
      }, MOVE_HOLD_MS)

      holdMoveCleanupRef.current = finishCleanup
      document.addEventListener('mousemove', onPointerMove)
      document.addEventListener('mouseup', onPointerUp)
    },
    [setIsPlaying, computePreviewForDrag, timelineRowRef]
  )

  const handleTrimStart = useCallback((videoId: string, handle: TrimHandle, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const video = videos.find((v) => v.id === videoId)
    if (!video || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    useManifestStore.getState().pauseHistory()
    timelineHandleHistoryPausedRef.current = true
    setTrimDragging({ videoId, handle })
    trimStartRef.current = {
      trimStart: video.trimStart,
      trimEnd: video.trimEnd,
      initialTimestamp: video.timestamp,
      originalDuration: video.originalDuration ?? video.duration ?? 0,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
    setIsPlaying(false)
  }, [videos, totalDuration, effectivePadding, setIsPlaying, timelineRowRef])

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimDragging || !timelineRowRef.current || !trimStartRef.current) return
    const video = videos.find((v) => v.id === trimDragging.videoId)
    if (!video) return
    const { originalDuration, trimStart: initialTrimStart, trimEnd: initialTrimEnd, initialTimestamp, initialMouseX, timelineWidth, totalWithPadding } = trimStartRef.current
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalWithPadding
    const playbackSpeed = video.playbackSpeed ?? 1
    const targets = getSnapTargets(trimDragging.videoId)

    if (trimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime * playbackSpeed
      const globalLeftEdge = initialTimestamp + (newTrimStart - initialTrimStart) / playbackSpeed
      const snapped = snapToMarkers(globalLeftEdge, targets, snapThresholdSec)
      if (snapped !== globalLeftEdge) {
        newTrimStart = initialTrimStart + (snapped - initialTimestamp) * playbackSpeed
      }
      newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - (0.5 * playbackSpeed)))
      const actualSourceDelta = newTrimStart - initialTrimStart
      let newTimestamp = Math.max(0, initialTimestamp + actualSourceDelta / playbackSpeed)
      if (video.row === 0) {
        const allMainItems = [
          ...videos.filter(v => !v.isOverlay).map(v => ({ id: v.id, start: v.timestamp, end: v.timestamp + (v.duration ?? 0) })),
          ...images.filter(img => img.isMainTrack).map(img => ({ id: img.id, start: img.startTime, end: img.endTime }))
        ].sort((a, b) => a.start - b.start)
        const currentIndex = allMainItems.findIndex(item => item.id === video.id)
        const previousItem = currentIndex > 0 ? allMainItems[currentIndex - 1] : null
        const minStart = previousItem ? previousItem.end : 0
        if (newTimestamp < minStart) {
          newTimestamp = minStart
          newTrimStart = initialTrimStart + (newTimestamp - initialTimestamp) * playbackSpeed
          newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - (0.5 * playbackSpeed)))
        }
      }
      trimVideo(trimDragging.videoId, newTrimStart, initialTrimEnd, newTimestamp)
    } else if (trimDragging.handle === 'end') {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime * playbackSpeed
      const globalRightEdge = initialTimestamp + (originalDuration - initialTrimStart - newTrimEnd) / playbackSpeed
      const snapped = snapToMarkers(globalRightEdge, targets, snapThresholdSec)
      if (snapped !== globalRightEdge) {
        newTrimEnd = originalDuration - initialTrimStart - (snapped - initialTimestamp) * playbackSpeed
      }
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - (0.5 * playbackSpeed)))
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
    }
  }, [trimDragging, videos, images, trimVideo, timelineRowRef, getSnapTargets, snapThresholdSec])

  const handleTrimEnd = useCallback(() => {
    setTrimDragging(null)
    trimStartRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  const handleAudioTrimStart = useCallback((audioId: string, handle: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const audioItem = audios.find((a) => a.id === audioId)
    if (!audioItem || !timelineRowRef.current) return
    const rect = timelineRowRef.current.getBoundingClientRect()
    useManifestStore.getState().pauseHistory()
    timelineHandleHistoryPausedRef.current = true
    setAudioTrimDragging({ audioId, handle })
    const playbackSpeed = audioItem.playbackSpeed ?? 1
    audioTrimRef.current = {
      trimStart: audioItem.trimStart,
      trimEnd: audioItem.trimEnd,
      originalDuration: audioItem.originalDuration,
      startTime: audioItem.startTime,
      fileOffset: audioItem.startTime - audioItem.trimStart / playbackSpeed,
      initialMouseX: e.clientX,
      timelineWidth: rect.width,
      totalWithPadding: totalDuration + effectivePadding * 2,
    }
    setIsPlaying(false)
  }, [audios, totalDuration, effectivePadding, setIsPlaying, timelineRowRef])

  const handleAudioTrimMove = useCallback((e: MouseEvent) => {
    if (!audioTrimDragging || !audioTrimRef.current) return
    const { trimStart: initialTrimStart, trimEnd: initialTrimEnd, originalDuration, fileOffset, initialMouseX, timelineWidth, totalWithPadding } = audioTrimRef.current
    const mouseDeltaX = e.clientX - initialMouseX
    const mouseDeltaTime = (mouseDeltaX / timelineWidth) * totalWithPadding
    const minDuration = 0.5
    const audio = audios.find(a => a.id === audioTrimDragging.audioId)
    if (!audio) return
    const playbackSpeed = audio.playbackSpeed ?? 1
    const targets = getSnapTargets(audioTrimDragging.audioId)

    if (audioTrimDragging.handle === 'start') {
      let newTrimStart = initialTrimStart + mouseDeltaTime * playbackSpeed
      newTrimStart = Math.max(0, Math.min(newTrimStart, originalDuration - initialTrimEnd - (minDuration * playbackSpeed)))
      let newStartTime = fileOffset + newTrimStart / playbackSpeed
      const snapped = snapToMarkers(newStartTime, targets, snapThresholdSec)
      if (snapped !== newStartTime) {
        newStartTime = snapped
        newTrimStart = (newStartTime - fileOffset) * playbackSpeed
      }
      if (newStartTime < 0) { newStartTime = 0; newTrimStart = -fileOffset * playbackSpeed }
      trimAudio(audioTrimDragging.audioId, newTrimStart, initialTrimEnd, newStartTime)
    } else {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime * playbackSpeed
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - (minDuration * playbackSpeed)))
      const activeDur = (originalDuration - initialTrimStart - newTrimEnd) / playbackSpeed
      const currentEndTime = audio.startTime + activeDur
      const snapped = snapToMarkers(currentEndTime, targets, snapThresholdSec)
      if (snapped !== currentEndTime) {
        const newActiveDur = snapped - audio.startTime
        newTrimEnd = originalDuration - initialTrimStart - newActiveDur * playbackSpeed
      }
      trimAudio(audioTrimDragging.audioId, initialTrimStart, newTrimEnd)
    }
  }, [audioTrimDragging, audios, trimAudio, getSnapTargets, snapThresholdSec])

  const handleAudioTrimEnd = useCallback(() => {
    setAudioTrimDragging(null)
    audioTrimRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  const handleAudioBodyDragStart = useCallback(
    (audioId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return
      scheduleHoldMoveDrag(e, () => {
        const audioItem = useManifestStore.getState().audios.find((a) => a.id === audioId)
        if (!audioItem || !timelineRowRef.current) return null
        const activeDur =
          (audioItem.originalDuration - audioItem.trimStart - audioItem.trimEnd) /
          (audioItem.playbackSpeed ?? 1)
        return {
          itemId: audioId,
          itemType: 'audio' as const,
          handle: 'move' as const,
          initialStartTime: audioItem.startTime,
          initialRow: audioItem.row,
          duration: activeDur,
        }
      })
    },
    [scheduleHoldMoveDrag, timelineRowRef]
  )

  const handleAudioBodyDragMove = useCallback((e: MouseEvent) => {
    if (!audioBodyDragging || !audioBodyDragRef.current) return
    const { initialStartTime, initialTrimStart, initialTrimEnd, initialOrigDuration, initialEffectiveDuration, initialMouseX, timelineWidth, totalWithPadding, totalDuration: td } = audioBodyDragRef.current
    const mouseDeltaTime = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const audio = audios.find(a => a.id === audioBodyDragging.audioId)
    if (!audio) return
    const playbackSpeed = audio.playbackSpeed ?? 1
    const targets = getSnapTargets(audioBodyDragging.audioId)

    let newStartTime = Math.max(0, initialStartTime + mouseDeltaTime)
    const activeDur = (initialOrigDuration - initialTrimStart - initialTrimEnd) / playbackSpeed
    
    const snappedStart = snapToMarkers(newStartTime, targets, snapThresholdSec)
    if (snappedStart !== newStartTime) {
      newStartTime = snappedStart
    } else {
      const currentEndTime = newStartTime + activeDur
      const snappedEnd = snapToMarkers(currentEndTime, targets, snapThresholdSec)
      if (snappedEnd !== currentEndTime) {
        newStartTime = snappedEnd - activeDur
      }
    }

    const newActiveDuration = Math.min(initialEffectiveDuration, Math.max(0, td - newStartTime))
    const newTrimEnd = Math.max(0, initialOrigDuration - initialTrimStart - newActiveDuration * playbackSpeed)
    trimAudio(audioBodyDragging.audioId, initialTrimStart, newTrimEnd, newStartTime)
  }, [audioBodyDragging, audios, trimAudio, getSnapTargets, snapThresholdSec])

  const handleAudioBodyDragEnd = useCallback(() => {
    setAudioBodyDragging(null)
    audioBodyDragRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  const handleImageDragStart = useCallback(
    (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        if (e.button !== 0) return
        scheduleHoldMoveDrag(e, () => {
          const image = useManifestStore.getState().images.find((o) => o.id === imageId)
          if (!image || !timelineRowRef.current) return null
          const duration = image.endTime - image.startTime
          return {
            itemId: imageId,
            itemType: 'image' as const,
            handle,
            initialStartTime: image.startTime,
            initialRow: image.row,
            duration,
          }
        })
        return
      }
      e.stopPropagation()
      e.preventDefault()
      const image = images.find((o) => o.id === imageId)
      if (!image || !timelineRowRef.current) return
      useManifestStore.getState().pauseHistory()
      timelineHandleHistoryPausedRef.current = true
      setImageDragging({ imageId, handle })
      imageDragRef.current = {
        initialMouseX: e.clientX,
        initialStartTime: image.startTime,
        initialEndTime: image.endTime,
        timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
      }
    },
    [images, timelineRowRef, scheduleHoldMoveDrag]
  )

  const handleImageDragMove = useCallback((e: MouseEvent) => {
    if (!imageDragging || !imageDragRef.current) return
    const { imageId, handle } = imageDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = imageDragRef.current
    const image = images.find((img) => img.id === imageId)
    if (!image) return
    const totalWithPadding = totalDuration + effectivePadding * 2
    const mouseDelta = e.clientX - initialMouseX
    const timeDelta = (mouseDelta / timelineWidth) * totalWithPadding
    const targets = getSnapTargets(imageId)

    if (handle === 'move') {
      let newStart = initialStartTime + timeDelta
      const dur = initialEndTime - initialStartTime
      const snappedStart = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snappedStart !== newStart) {
        newStart = snappedStart
      } else {
        const currentEnd = newStart + dur
        const snappedEnd = snapToMarkers(currentEnd, targets, snapThresholdSec)
        if (snappedEnd !== currentEnd) {
          newStart = snappedEnd - dur
        }
      }
      if (newStart < 0) newStart = 0
      updateImage(imageId, { startTime: newStart, endTime: newStart + dur })
    } else if (handle === 'start') {
      let newStart = Math.max(0, Math.min(initialStartTime + timeDelta, initialEndTime - 0.1))
      const snapped = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snapped !== newStart && snapped < initialEndTime - 0.1) {
        newStart = snapped
      }
      const newDur = Math.max(0.1, initialEndTime - newStart)
      updateImage(imageId, { startTime: newStart, endTime: newStart + newDur })
    } else if (handle === 'end') {
      let newEnd = Math.max(image.startTime + 0.1, initialEndTime + timeDelta)
      const snapped = snapToMarkers(newEnd, targets, snapThresholdSec)
      if (snapped !== newEnd && snapped > image.startTime + 0.1) {
        newEnd = snapped
      }
      updateImage(imageId, { endTime: newEnd })
    }
  }, [imageDragging, images, totalDuration, effectivePadding, updateImage, getSnapTargets, snapThresholdSec])

  const handleImageDragEnd = useCallback(() => {
    setImageDragging(null)
    imageDragRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  const handleOverlayVideoDragStart = useCallback(
    (videoId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return
      scheduleHoldMoveDrag(e, () => {
        const video = useManifestStore.getState().videos.find((v) => v.id === videoId)
        if (!video || !timelineRowRef.current) return null
        return {
          itemId: videoId,
          itemType: 'video' as const,
          handle: 'move' as const,
          initialStartTime: video.timestamp,
          initialRow: video.row,
          duration: video.duration ?? 0,
        }
      })
    },
    [scheduleHoldMoveDrag, timelineRowRef]
  )

  const handleOverlayVideoDragMove = useCallback((e: MouseEvent) => {
    if (!overlayVideoDragging || !overlayVideoDragRef.current) return
    const { videoId } = overlayVideoDragging
    const { initialMouseX, initialTimestamp, timelineWidth, totalWithPadding } = overlayVideoDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const video = videos.find(v => v.id === videoId)
    if (!video) return
    const targets = getSnapTargets(videoId)

    let newTimestamp = Math.max(0, initialTimestamp + timeDelta)
    const snappedStart = snapToMarkers(newTimestamp, targets, snapThresholdSec)
    if (snappedStart !== newTimestamp) {
      newTimestamp = snappedStart
    } else {
      const dur = video.duration ?? 0
      const currentEndTime = newTimestamp + dur
      const snappedEnd = snapToMarkers(currentEndTime, targets, snapThresholdSec)
      if (snappedEnd !== currentEndTime) {
        newTimestamp = snappedEnd - dur
      }
    }
    if (newTimestamp < 0) newTimestamp = 0
    updateVideo(videoId, { timestamp: newTimestamp })
  }, [overlayVideoDragging, updateVideo, videos, getSnapTargets, snapThresholdSec])

  const handleOverlayVideoDragEnd = useCallback(() => {
    setOverlayVideoDragging(null)
    overlayVideoDragRef.current = null
    pushHistory()
  }, [pushHistory])

  const handleTextDragStart = useCallback(
    (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        if (e.button !== 0) return
        scheduleHoldMoveDrag(e, () => {
          const text = useManifestStore.getState().texts.find((t) => t.id === textId)
          if (!text || !timelineRowRef.current) return null
          const duration = text.endTime - text.startTime
          return {
            itemId: textId,
            itemType: 'text' as const,
            handle,
            initialStartTime: text.startTime,
            initialRow: text.row,
            duration,
          }
        })
        return
      }
      e.stopPropagation()
      e.preventDefault()
      const text = texts.find((t) => t.id === textId)
      if (!text || !timelineRowRef.current) return
      useManifestStore.getState().pauseHistory()
      timelineHandleHistoryPausedRef.current = true
      setTextDragging({ textId, handle })
      textDragRef.current = {
        initialMouseX: e.clientX,
        initialStartTime: text.startTime,
        initialEndTime: text.endTime,
        timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
        totalWithPadding: totalDuration + effectivePadding * 2,
      }
    },
    [texts, timelineRowRef, totalDuration, effectivePadding, scheduleHoldMoveDrag]
  )

  const handleTextDragMove = useCallback((e: MouseEvent) => {
    if (!textDragging || !textDragRef.current) return
    const { textId, handle } = textDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth, totalWithPadding } = textDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const others = texts.filter((t) => t.id !== textId).sort((a, b) => a.startTime - b.startTime)
    const prevEnd = others.filter((t) => t.endTime <= initialStartTime).reduce((max, t) => Math.max(max, t.endTime), 0)
    const nextStart = others.filter((t) => t.startTime >= initialEndTime).reduce((min, t) => Math.min(min, t.startTime), Infinity)
    const targets = getSnapTargets(textId)

    if (handle === 'move') {
      const dur = initialEndTime - initialStartTime
      let newStart = initialStartTime + timeDelta
      const snappedStart = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snappedStart !== newStart) {
        newStart = snappedStart
      } else {
        const currentEnd = newStart + dur
        const snappedEnd = snapToMarkers(currentEnd, targets, snapThresholdSec)
        if (snappedEnd !== currentEnd) {
          newStart = snappedEnd - dur
        }
      }
      let newEnd = newStart + dur
      if (newStart < prevEnd) { newStart = prevEnd; newEnd = newStart + dur }
      if (newEnd > nextStart) { newEnd = nextStart; newStart = newEnd - dur }
      if (newStart < 0) { newStart = 0; newEnd = dur }
      updateText(textId, { startTime: newStart, endTime: newEnd })
    } else if (handle === 'start') {
      let newStart = Math.max(prevEnd, Math.min(initialStartTime + timeDelta, initialEndTime - 0.1))
      const snapped = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snapped !== newStart && snapped < initialEndTime - 0.1 && snapped >= prevEnd) {
        newStart = snapped
      }
      updateText(textId, { startTime: newStart })
    } else if (handle === 'end') {
      const currentStart = texts.find((t) => t.id === textId)?.startTime ?? initialStartTime
      let newEnd = Math.min(nextStart, Math.max(currentStart + 0.1, initialEndTime + timeDelta))
      const snapped = snapToMarkers(newEnd, targets, snapThresholdSec)
      if (snapped !== newEnd && snapped > currentStart + 0.1 && snapped <= nextStart) {
        newEnd = snapped
      }
      updateText(textId, { endTime: newEnd })
    }
  }, [textDragging, texts, updateText, getSnapTargets, snapThresholdSec])

  const handleTextDragEnd = useCallback(() => {
    setTextDragging(null)
    textDragRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  const handleEffectDragStart = useCallback(
    (effectId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        if (e.button !== 0) return
        scheduleHoldMoveDrag(e, () => {
          const effect = useManifestStore.getState().effects.find((f) => f.id === effectId)
          if (!effect || !timelineRowRef.current) return null
          const duration = effect.endTime - effect.startTime
          return {
            itemId: effectId,
            itemType: 'effect' as const,
            handle,
            initialStartTime: effect.startTime,
            initialRow: effect.row,
            duration,
          }
        })
        return
      }
      e.stopPropagation()
      e.preventDefault()
      const effect = useManifestStore.getState().effects.find((f) => f.id === effectId)
      if (!effect || !timelineRowRef.current) return
      useManifestStore.getState().pauseHistory()
      timelineHandleHistoryPausedRef.current = true
      setEffectDragging({ effectId, handle })
      effectDragRef.current = {
        initialMouseX: e.clientX,
        initialStartTime: effect.startTime,
        initialEndTime: effect.endTime,
        timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
        totalWithPadding: totalDuration + effectivePadding * 2,
      }
    },
    [totalDuration, effectivePadding, timelineRowRef, scheduleHoldMoveDrag]
  )

  const handleEffectDragMove = useCallback((e: MouseEvent) => {
    if (!effectDragging || !effectDragRef.current) return
    const { effectId, handle } = effectDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth, totalWithPadding } = effectDragRef.current
    const timeDelta = ((e.clientX - initialMouseX) / timelineWidth) * totalWithPadding
    const effect = useManifestStore.getState().effects.find((f) => f.id === effectId)
    if (!effect) return
    const targets = getSnapTargets(effectId)

    if (handle === 'move') {
      const dur = initialEndTime - initialStartTime
      let newStart = initialStartTime + timeDelta
      const snappedStart = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snappedStart !== newStart) {
        newStart = snappedStart
      } else {
        const currentEnd = newStart + dur
        const snappedEnd = snapToMarkers(currentEnd, targets, snapThresholdSec)
        if (snappedEnd !== currentEnd) {
          newStart = snappedEnd - dur
        }
      }
      if (newStart < 0) newStart = 0
      updateEffect(effectId, { startTime: newStart, endTime: newStart + dur })
    } else if (handle === 'start') {
      let newStart = Math.max(0, Math.min(initialStartTime + timeDelta, initialEndTime - 0.1))
      const snapped = snapToMarkers(newStart, targets, snapThresholdSec)
      if (snapped !== newStart && snapped < initialEndTime - 0.1) {
        newStart = snapped
      }
      updateEffect(effectId, { startTime: newStart })
    } else if (handle === 'end') {
      let newEnd = Math.max(effect.startTime + 0.1, initialEndTime + timeDelta)
      const snapped = snapToMarkers(newEnd, targets, snapThresholdSec)
      if (snapped !== newEnd && snapped > effect.startTime + 0.1) {
        newEnd = snapped
      }
      updateEffect(effectId, { endTime: newEnd })
    }
  }, [effectDragging, updateEffect, getSnapTargets, snapThresholdSec])

  const handleEffectDragEnd = useCallback(() => {
    setEffectDragging(null)
    effectDragRef.current = null
    if (timelineHandleHistoryPausedRef.current) {
      useManifestStore.getState().resumeHistory()
      timelineHandleHistoryPausedRef.current = false
    }
    pushHistory()
  }, [pushHistory])

  useEffect(() => {
    if (trimDragging) {
      document.addEventListener('mousemove', handleTrimMove)
      document.addEventListener('mouseup', handleTrimEnd)
      return () => {
        document.removeEventListener('mousemove', handleTrimMove)
        document.removeEventListener('mouseup', handleTrimEnd)
      }
    }
  }, [trimDragging, handleTrimMove, handleTrimEnd])

  useEffect(() => {
    if (audioTrimDragging) {
      document.addEventListener('mousemove', handleAudioTrimMove)
      document.addEventListener('mouseup', handleAudioTrimEnd)
      return () => {
        document.removeEventListener('mousemove', handleAudioTrimMove)
        document.removeEventListener('mouseup', handleAudioTrimEnd)
      }
    }
  }, [audioTrimDragging, handleAudioTrimMove, handleAudioTrimEnd])

  useEffect(() => {
    if (audioBodyDragging) {
      document.addEventListener('mousemove', handleAudioBodyDragMove)
      document.addEventListener('mouseup', handleAudioBodyDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleAudioBodyDragMove)
        document.removeEventListener('mouseup', handleAudioBodyDragEnd)
      }
    }
  }, [audioBodyDragging, handleAudioBodyDragMove, handleAudioBodyDragEnd])

  useEffect(() => {
    if (imageDragging) {
      document.addEventListener('mousemove', handleImageDragMove)
      document.addEventListener('mouseup', handleImageDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleImageDragMove)
        document.removeEventListener('mouseup', handleImageDragEnd)
      }
    }
  }, [imageDragging, handleImageDragMove, handleImageDragEnd])

  useEffect(() => {
    if (overlayVideoDragging) {
      document.addEventListener('mousemove', handleOverlayVideoDragMove)
      document.addEventListener('mouseup', handleOverlayVideoDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleOverlayVideoDragMove)
        document.removeEventListener('mouseup', handleOverlayVideoDragEnd)
      }
    }
  }, [overlayVideoDragging, handleOverlayVideoDragMove, handleOverlayVideoDragEnd])

  useEffect(() => {
    if (textDragging) {
      document.addEventListener('mousemove', handleTextDragMove)
      document.addEventListener('mouseup', handleTextDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleTextDragMove)
        document.removeEventListener('mouseup', handleTextDragEnd)
      }
    }
  }, [textDragging, handleTextDragMove, handleTextDragEnd])

  useEffect(() => {
    if (effectDragging) {
      document.addEventListener('mousemove', handleEffectDragMove)
      document.addEventListener('mouseup', handleEffectDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleEffectDragMove)
        document.removeEventListener('mouseup', handleEffectDragEnd)
      }
    }
  }, [effectDragging, handleEffectDragMove, handleEffectDragEnd])

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!activeDrag) return
    const newState = calculateDragState(e)
    if (newState) {
      setDragPreview(newState)
    }
  }, [activeDrag, calculateDragState])

  const handleDragEnd = useCallback(() => {
    if (!activeDrag || !dragPreview) {
      setActiveDrag(null)
      setDragPreview(null)
      return
    }

    const { itemId } = activeDrag
    const { targetRow, targetTime, isInsertion, isValid } = dragPreview

    if (isValid) {
      if (isInsertion) {
        insertRow(targetRow)
        moveItemToRow(itemId, targetRow, targetTime)
      } else {
        moveItemToRow(itemId, targetRow, targetTime)
      }
    }

    setActiveDrag(null)
    setDragPreview(null)
    pushHistory()
  }, [activeDrag, dragPreview, moveItemToRow, insertRow, pushHistory])

  useEffect(() => {
    if (activeDrag) {
      document.addEventListener('mousemove', handleDragMove)
      document.addEventListener('mouseup', handleDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [activeDrag, handleDragMove, handleDragEnd])

  return {
    activeDrag,
    dragPreview,
    holdDragPreview,
    trimDragging, setTrimDragging,
    audioTrimDragging, setAudioTrimDragging,
    audioBodyDragging, setAudioBodyDragging,
    imageDragging, setImageDragging,
    overlayVideoDragging, setOverlayVideoDragging,
    textDragging, setTextDragging,
    handleTrimStart,
    handleAudioTrimStart,
    handleAudioBodyDragStart,
    handleImageDragStart,
    handleOverlayVideoDragStart,
    handleTextDragStart,
    handleEffectDragStart
  }
}
