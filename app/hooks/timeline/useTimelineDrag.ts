import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

const MOVE_HOLD_MS = 280
const HOLD_PREVIEW_MOVE_SLOP_PX = 8
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import {
  applyBounds,
  clampMinDuration,
  getMaxOverlayRow,
  overlapsAny,
  resolveTargetRow,
  shiftItemsForwardInRow as buildRowShiftPlan,
  shouldRippleExpansionInRow as shouldRippleForWindow,
  snapStartOrEnd,
  toTimeDelta,
} from '@/app/lib/timeline'
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

type TimelineInterval = { start: number; end: number }
type TimelineItemType = 'video' | 'image' | 'text' | 'audio' | 'effect'
type RowItem = {
  type: TimelineItemType
  id: string
  start: number
  end: number
  shift?: (amount: number) => void
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
  updateText: (id: string, updates: Partial<TextClass>) => void
  updateEffect: (id: string, updates: Partial<EffectClass>) => void
  trimAudio: (id: string, start: number, end: number, ts?: number) => void
  moveItemToRow: (id: string, targetRow: number, newTime?: number) => void
  insertRow: (atIndex: number) => void
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
  updateText,
  updateEffect,
  trimAudio,
  moveItemToRow,
  insertRow,
  pushHistory,
}: UseTimelineDragProps) {
  const snapThresholdSec = useMemo(() => timelineSnapThresholdSeconds(visibleDuration), [visibleDuration])

  const [trimDragging, setTrimDragging] = useState<{ videoId: string; handle: TrimHandle } | null>(null)
  const [audioTrimDragging, setAudioTrimDragging] = useState<{ audioId: string; handle: 'start' | 'end' } | null>(null)
  const [imageDragging, setImageDragging] = useState<{ imageId: string; handle: 'move' | 'start' | 'end' } | null>(null)
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
  const imageDragRef = useRef<any>(null)
  const timelineHandleHistoryPausedRef = useRef(false)
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

  const getRowItems = useCallback(
    (row: number, excludeType?: TimelineItemType, excludeId?: string, includeShift = false): RowItem[] => {
      const st = useManifestStore.getState()
      const items: RowItem[] = []

      st.videos.forEach((v) => {
        if (v.row !== row) return
        if (excludeType === 'video' && v.id === excludeId) return
        items.push({
          type: 'video',
          id: v.id,
          start: v.timestamp,
          end: v.timestamp + (v.duration ?? 0),
          shift: includeShift ? (amount: number) => st.updateVideo(v.id, { timestamp: v.timestamp + amount }) : undefined,
        })
      })
      st.images.forEach((img) => {
        if (img.row !== row) return
        if (excludeType === 'image' && img.id === excludeId) return
        items.push({
          type: 'image',
          id: img.id,
          start: img.startTime,
          end: img.endTime,
          shift: includeShift
            ? (amount: number) => st.updateImage(img.id, { startTime: img.startTime + amount, endTime: img.endTime + amount })
            : undefined,
        })
      })
      st.texts.forEach((t) => {
        if (t.row !== row) return
        if (excludeType === 'text' && t.id === excludeId) return
        items.push({
          type: 'text',
          id: t.id,
          start: t.startTime,
          end: t.endTime,
          shift: includeShift
            ? (amount: number) => st.updateText(t.id, { startTime: t.startTime + amount, endTime: t.endTime + amount })
            : undefined,
        })
      })
      st.effects.forEach((e) => {
        if (e.row !== row) return
        if (excludeType === 'effect' && e.id === excludeId) return
        items.push({
          type: 'effect',
          id: e.id,
          start: e.startTime,
          end: e.endTime,
          shift: includeShift
            ? (amount: number) => st.updateEffect(e.id, { startTime: e.startTime + amount, endTime: e.endTime + amount })
            : undefined,
        })
      })
      st.audios.forEach((a) => {
        if (a.row !== row) return
        if (excludeType === 'audio' && a.id === excludeId) return
        items.push({
          type: 'audio',
          id: a.id,
          start: a.startTime,
          end: a.endTime,
          shift: includeShift
            ? (amount: number) => st.updateAudio(a.id, { startTime: a.startTime + amount, endTime: a.endTime + amount })
            : undefined,
        })
      })
      return items
    },
    []
  )

  const getIntervalsForRow = useCallback(
    (row: number, itemId: string, mode: 'audioOnly' | 'nonAudio' | 'all'): TimelineInterval[] => {
      return getRowItems(row)
        .filter((item) => item.id !== itemId)
        .filter((item) => (mode === 'all' ? true : mode === 'audioOnly' ? item.type === 'audio' : item.type !== 'audio'))
        .map((item) => ({ start: item.start, end: item.end }))
    },
    [getRowItems]
  )

  const shiftItemsForwardInRow = useCallback(
    (
      row: number,
      fromTime: number,
      delta: number,
      excludeType: TimelineItemType,
      excludeId: string
    ) => {
      if (delta <= 0) return
      const threshold = 0.01
      const items = getRowItems(row, excludeType, excludeId, true).filter(
        (item): item is RowItem & { shift: (amount: number) => void } => typeof item.shift === 'function'
      )
      const plan = buildRowShiftPlan(
        items.map((item) => ({ id: item.id, startTime: item.start, endTime: item.end })),
        fromTime,
        delta,
        threshold
      )
      const byId = new Map(items.map((item) => [item.id, item]))
      plan.forEach(({ id, shiftAmount }) => {
        byId.get(id)?.shift(shiftAmount)
      })
    },
    [getRowItems]
  )

  const shouldRippleExpansionInRow = useCallback(
    (
      row: number,
      fromTime: number,
      toTime: number,
      excludeType: TimelineItemType,
      excludeId: string
    ): boolean => {
      const threshold = 0.01
      const items = getRowItems(row, excludeType, excludeId).map((item) => ({
        id: item.id,
        startTime: item.start,
        endTime: item.end,
      }))
      return shouldRippleForWindow(fromTime, toTime, items, threshold)
    },
    [getRowItems]
  )

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

      const timeDelta = toTimeDelta(clientX, pressClientX, timelineWidth, totalWithPadding)
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
      } else {
        const st = useManifestStore.getState()
        const maxOverlayRow = getMaxOverlayRow(st)
        const resolved = resolveTargetRow(rowElements, clientY, itemType, initialRow, maxOverlayRow)
        targetRow = resolved.targetRow
        isInsertion = resolved.isInsertion
      }

      if (
        !lockTargetRowToInitial &&
        (itemType === 'text' || itemType === 'effect') &&
        targetRow === 0
      ) {
        targetRow = findFreeVisualOverlayRow(targetTime, targetTime + duration)
      }

      const myStart = targetTime
      const myEnd = targetTime + duration
      const threshold = 0.01

      if (!isInsertion && targetRow >= 0 && itemType !== 'audio') {
        const intervals = getIntervalsForRow(targetRow, itemId, 'nonAudio')
        if (overlapsAny(myStart, myEnd, intervals, threshold)) {
          isValid = false
        }
      }

      if (!isInsertion && itemType === 'audio' && targetRow >= 0) {
        const intervals = getIntervalsForRow(targetRow, itemId, 'audioOnly')
        if (overlapsAny(myStart, myEnd, intervals, threshold)) {
          isValid = false
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
    [
      timelineRowRef,
      totalDuration,
      effectivePadding,
      snapThresholdSec,
      getSnapTargets,
      getIntervalsForRow,
    ]
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

  type DragHandle = 'move' | 'start' | 'end'
  type DragBounds = {
    minStart?: number
    maxStart?: number
    minEnd?: number
    maxEnd?: number
  }
  type VisualDragInput = {
    handle: DragHandle
    initialStartTime: number
    initialEndTime: number
    currentStartTime: number
    timeDelta: number
    targets: number[]
    minDuration: number
    bounds?: DragBounds
  }

  const computeVisualItemDrag = useCallback(
    ({
      handle,
      initialStartTime,
      initialEndTime,
      currentStartTime,
      timeDelta,
      targets,
      minDuration,
      bounds,
    }: VisualDragInput) => {
      const duration = initialEndTime - initialStartTime
      if (handle === 'move') {
        let newStart = snapStartOrEnd(initialStartTime + timeDelta, duration, targets, snapThresholdSec)
        newStart = applyBounds(newStart, bounds?.minStart, bounds?.maxStart)
        let newEnd = newStart + duration
        if (bounds?.minEnd !== undefined && newEnd < bounds.minEnd) {
          newEnd = bounds.minEnd
          newStart = newEnd - duration
        }
        if (bounds?.maxEnd !== undefined && newEnd > bounds.maxEnd) {
          newEnd = bounds.maxEnd
          newStart = newEnd - duration
        }
        return { startTime: newStart, endTime: newEnd }
      }

      if (handle === 'start') {
        const boundedStart = applyBounds(initialStartTime + timeDelta, bounds?.minStart, bounds?.maxStart)
        let newStart = clampMinDuration(boundedStart, initialEndTime, minDuration).start
        const snapped = snapToMarkers(newStart, targets, snapThresholdSec)
        const maxAllowedStart = clampMinDuration(
          bounds?.maxStart ?? initialEndTime,
          initialEndTime,
          minDuration
        ).start
        const minAllowedStart = bounds?.minStart ?? Number.NEGATIVE_INFINITY
        if (snapped !== newStart && snapped < maxAllowedStart && snapped >= minAllowedStart) {
          newStart = snapped
        }
        return { startTime: newStart }
      }

      const boundedEnd = applyBounds(initialEndTime + timeDelta, bounds?.minEnd, bounds?.maxEnd)
      let newEnd = clampMinDuration(currentStartTime, boundedEnd, minDuration).end
      const snapped = snapToMarkers(newEnd, targets, snapThresholdSec)
      const minAllowedEnd = clampMinDuration(currentStartTime, bounds?.minEnd ?? currentStartTime, minDuration).end
      const maxAllowedEnd = bounds?.maxEnd ?? Number.POSITIVE_INFINITY
      if (snapped !== newEnd && snapped > minAllowedEnd && snapped <= maxAllowedEnd) {
        newEnd = snapped
      }
      return { endTime: newEnd }
    },
    [snapThresholdSec]
  )

  const endDragWithHistory = useCallback(
    (clearDragging: () => void, clearRef: () => void) => {
      clearDragging()
      clearRef()
      if (timelineHandleHistoryPausedRef.current) {
        useManifestStore.getState().resumeHistory()
        timelineHandleHistoryPausedRef.current = false
      }
      pushHistory()
    },
    [pushHistory]
  )

  type VisualMoveDraft = {
    itemId: string
    itemType: 'image' | 'text' | 'effect'
    initialStartTime: number
    initialRow: number
    duration: number
  }

  const scheduleVisualMoveStart = useCallback(
    (e: React.MouseEvent, getDraft: () => VisualMoveDraft | null) => {
      if (e.button !== 0) return
      scheduleHoldMoveDrag(e, () => {
        const draft = getDraft()
        if (!draft || !timelineRowRef.current) return null
        return {
          ...draft,
          handle: 'move' as const,
        }
      })
    },
    [scheduleHoldMoveDrag, timelineRowRef]
  )

  type VisualEdgeDragItem = { startTime: number; endTime: number }
  type VisualEdgeDragSnapshot = {
    initialMouseX: number
    initialStartTime: number
    initialEndTime: number
    timelineWidth: number
  }

  const beginVisualEdgeDrag = useCallback(
    <T extends VisualEdgeDragItem>(
      e: React.MouseEvent,
      handle: 'start' | 'end',
      getItem: () => T | undefined,
      setDragging: () => void,
      setDragRef: (base: VisualEdgeDragSnapshot) => void
    ) => {
      e.stopPropagation()
      e.preventDefault()
      const item = getItem()
      if (!item || !timelineRowRef.current) return
      useManifestStore.getState().pauseHistory()
      timelineHandleHistoryPausedRef.current = true
      setDragging()
      setDragRef({
        initialMouseX: e.clientX,
        initialStartTime: item.startTime,
        initialEndTime: item.endTime,
        timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
      })
    },
    [timelineRowRef]
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
    const mouseDeltaTime = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
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
      const oldEnd = video.timestamp + (video.duration ?? 0)
      const newDuration = (originalDuration - initialTrimStart - newTrimEnd) / playbackSpeed
      const newEnd = video.timestamp + newDuration
      trimVideo(trimDragging.videoId, initialTrimStart, newTrimEnd)
      if (
        video.row >= 0 &&
        newEnd > oldEnd &&
        shouldRippleExpansionInRow(video.row, oldEnd, newEnd, 'video', trimDragging.videoId)
      ) {
        shiftItemsForwardInRow(video.row, oldEnd, newEnd - oldEnd, 'video', trimDragging.videoId)
      }
    }
  }, [
    trimDragging,
    videos,
    images,
    trimVideo,
    timelineRowRef,
    getSnapTargets,
    snapThresholdSec,
    shiftItemsForwardInRow,
    shouldRippleExpansionInRow,
  ])

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
    const mouseDeltaTime = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
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

  const handleImageDragStart = useCallback(
    (imageId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        scheduleVisualMoveStart(e, () => {
          const image = useManifestStore.getState().images.find((o) => o.id === imageId)
          if (!image) return null
          return {
            itemId: imageId,
            itemType: 'image' as const,
            initialStartTime: image.startTime,
            initialRow: image.row,
            duration: image.endTime - image.startTime,
          }
        })
        return
      }
      beginVisualEdgeDrag(
        e,
        handle,
        () => images.find((o) => o.id === imageId),
        () => setImageDragging({ imageId, handle }),
        (base) => {
          imageDragRef.current = base
        }
      )
    },
    [images, scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

  const handleImageDragMove = useCallback((e: MouseEvent) => {
    if (!imageDragging || !imageDragRef.current) return
    const { imageId, handle } = imageDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = imageDragRef.current
    const image = images.find((img) => img.id === imageId)
    if (!image) return
    const totalWithPadding = totalDuration + effectivePadding * 2
    const timeDelta = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
    const targets = getSnapTargets(imageId)

    const updates = computeVisualItemDrag({
      handle,
      initialStartTime,
      initialEndTime,
      currentStartTime: image.startTime,
      timeDelta,
      targets,
      minDuration: 0.1,
      bounds: {
        minStart: 0,
        maxStart: initialEndTime - 0.1,
        minEnd: image.startTime + 0.1,
      },
    })
    if (
      handle === 'end' &&
      image.row >= 0 &&
      updates.endTime !== undefined &&
      updates.endTime > initialEndTime &&
      shouldRippleExpansionInRow(image.row, initialEndTime, updates.endTime, 'image', imageId)
    ) {
      shiftItemsForwardInRow(image.row, initialEndTime, updates.endTime - initialEndTime, 'image', imageId)
    }
    updateImage(imageId, updates)
  }, [
    imageDragging,
    images,
    totalDuration,
    effectivePadding,
    updateImage,
    getSnapTargets,
    computeVisualItemDrag,
    shiftItemsForwardInRow,
    shouldRippleExpansionInRow,
  ])

  const handleImageDragEnd = useCallback(() => {
    endDragWithHistory(
      () => setImageDragging(null),
      () => {
        imageDragRef.current = null
      }
    )
  }, [endDragWithHistory])

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

  const handleTextDragStart = useCallback(
    (textId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        scheduleVisualMoveStart(e, () => {
          const text = useManifestStore.getState().texts.find((t) => t.id === textId)
          if (!text) return null
          return {
            itemId: textId,
            itemType: 'text' as const,
            initialStartTime: text.startTime,
            initialRow: text.row,
            duration: text.endTime - text.startTime,
          }
        })
        return
      }
      beginVisualEdgeDrag(
        e,
        handle,
        () => texts.find((t) => t.id === textId),
        () => setTextDragging({ textId, handle }),
        (base) => {
          textDragRef.current = {
            ...base,
            totalWithPadding: totalDuration + effectivePadding * 2,
          }
        }
      )
    },
    [texts, totalDuration, effectivePadding, scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

  const handleTextDragMove = useCallback((e: MouseEvent) => {
    if (!textDragging || !textDragRef.current) return
    const { textId, handle } = textDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth, totalWithPadding } = textDragRef.current
    const timeDelta = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
    const others = texts.filter((t) => t.id !== textId).sort((a, b) => a.startTime - b.startTime)
    const prevEnd = others.filter((t) => t.endTime <= initialStartTime).reduce((max, t) => Math.max(max, t.endTime), 0)
    const nextStart = others.filter((t) => t.startTime >= initialEndTime).reduce((min, t) => Math.min(min, t.startTime), Infinity)
    const targets = getSnapTargets(textId)

    const textItem = texts.find((t) => t.id === textId)
    if (!textItem) return
    const currentStart = textItem.startTime
    const updates = computeVisualItemDrag({
      handle,
      initialStartTime,
      initialEndTime,
      currentStartTime: currentStart,
      timeDelta,
      targets,
      minDuration: 0.1,
      bounds: {
        minStart: prevEnd,
        maxStart: initialEndTime - 0.1,
        minEnd: currentStart + 0.1,
        maxEnd: nextStart,
      },
    })
    if (
      handle === 'end' &&
      textItem.row >= 0 &&
      updates.endTime !== undefined &&
      updates.endTime > initialEndTime &&
      shouldRippleExpansionInRow(textItem.row, initialEndTime, updates.endTime, 'text', textId)
    ) {
      shiftItemsForwardInRow(textItem.row, initialEndTime, updates.endTime - initialEndTime, 'text', textId)
    }
    updateText(textId, updates)
  }, [
    textDragging,
    texts,
    updateText,
    getSnapTargets,
    computeVisualItemDrag,
    shiftItemsForwardInRow,
    shouldRippleExpansionInRow,
  ])

  const handleTextDragEnd = useCallback(() => {
    endDragWithHistory(
      () => setTextDragging(null),
      () => {
        textDragRef.current = null
      }
    )
  }, [endDragWithHistory])

  const handleEffectDragStart = useCallback(
    (effectId: string, handle: 'move' | 'start' | 'end', e: React.MouseEvent) => {
      if (handle === 'move') {
        scheduleVisualMoveStart(e, () => {
          const effect = useManifestStore.getState().effects.find((f) => f.id === effectId)
          if (!effect) return null
          return {
            itemId: effectId,
            itemType: 'effect' as const,
            initialStartTime: effect.startTime,
            initialRow: effect.row,
            duration: effect.endTime - effect.startTime,
          }
        })
        return
      }
      beginVisualEdgeDrag(
        e,
        handle,
        () => useManifestStore.getState().effects.find((f) => f.id === effectId),
        () => setEffectDragging({ effectId, handle }),
        (base) => {
          effectDragRef.current = {
            ...base,
            totalWithPadding: totalDuration + effectivePadding * 2,
          }
        }
      )
    },
    [totalDuration, effectivePadding, scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

  const handleEffectDragMove = useCallback((e: MouseEvent) => {
    if (!effectDragging || !effectDragRef.current) return
    const { effectId, handle } = effectDragging
    const { initialMouseX, initialStartTime, initialEndTime, timelineWidth, totalWithPadding } = effectDragRef.current
    const timeDelta = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
    const effect = useManifestStore.getState().effects.find((f) => f.id === effectId)
    if (!effect) return
    const targets = getSnapTargets(effectId)

    const updates = computeVisualItemDrag({
      handle,
      initialStartTime,
      initialEndTime,
      currentStartTime: effect.startTime,
      timeDelta,
      targets,
      minDuration: 0.1,
      bounds: {
        minStart: 0,
        maxStart: initialEndTime - 0.1,
        minEnd: effect.startTime + 0.1,
      },
    })
    if (
      handle === 'end' &&
      effect.row >= 0 &&
      updates.endTime !== undefined &&
      updates.endTime > initialEndTime &&
      shouldRippleExpansionInRow(effect.row, initialEndTime, updates.endTime, 'effect', effectId)
    ) {
      shiftItemsForwardInRow(effect.row, initialEndTime, updates.endTime - initialEndTime, 'effect', effectId)
    }
    updateEffect(effectId, updates)
  }, [
    effectDragging,
    updateEffect,
    getSnapTargets,
    computeVisualItemDrag,
    shiftItemsForwardInRow,
    shouldRippleExpansionInRow,
  ])

  const handleEffectDragEnd = useCallback(() => {
    endDragWithHistory(
      () => setEffectDragging(null),
      () => {
        effectDragRef.current = null
      }
    )
  }, [endDragWithHistory])

  const useDocumentDragListeners = (
    active: boolean,
    onMove: (e: MouseEvent) => void,
    onEnd: () => void
  ) => {
    useEffect(() => {
      if (!active) return
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onEnd)
      return () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onEnd)
      }
    }, [active, onMove, onEnd])
  }

  useDocumentDragListeners(Boolean(trimDragging), handleTrimMove, handleTrimEnd)
  useDocumentDragListeners(Boolean(audioTrimDragging), handleAudioTrimMove, handleAudioTrimEnd)
  useDocumentDragListeners(Boolean(imageDragging), handleImageDragMove, handleImageDragEnd)
  useDocumentDragListeners(Boolean(textDragging), handleTextDragMove, handleTextDragEnd)
  useDocumentDragListeners(Boolean(effectDragging), handleEffectDragMove, handleEffectDragEnd)

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

  useDocumentDragListeners(Boolean(activeDrag), handleDragMove, handleDragEnd)

  return {
    activeDrag,
    dragPreview,
    holdDragPreview,
    trimDragging,
    audioTrimDragging,
    imageDragging,
    textDragging,
    handleTrimStart,
    handleAudioTrimStart,
    handleAudioBodyDragStart,
    handleImageDragStart,
    handleOverlayVideoDragStart,
    handleTextDragStart,
    handleEffectDragStart
  }
}
