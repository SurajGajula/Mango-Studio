import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { snapToMarkers } from '@/app/lib/snapToMarkers'
import {
  applyBounds,
  clampMinDuration,
  getMaxOverlayRow,
  overlapsAny,
  occupancyIntervalsOnRow,
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

const MOVE_HOLD_MS = 280
const HOLD_PREVIEW_MOVE_SLOP_PX = 8
const ROW_SWITCH_SLOP_PX = 12

type TrimHandle = 'start' | 'end' | null

const TIMELINE_SNAP_REF_VISIBLE_SEC = 8
const TIMELINE_SNAP_BASE_SEC = 0.15
const TIMELINE_SNAP_MIN_SEC = 0.02
const TIMELINE_SNAP_MAX_SEC = 0.25

function timelineSnapThresholdSeconds(visibleDuration: number): number {
  const scaled = TIMELINE_SNAP_BASE_SEC * (visibleDuration / TIMELINE_SNAP_REF_VISIBLE_SEC)
  return Math.max(TIMELINE_SNAP_MIN_SEC, Math.min(TIMELINE_SNAP_MAX_SEC, scaled))
}

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
  type VisualEdgeKind = 'image' | 'text' | 'effect'
  const [visualEdgeDragging, setVisualEdgeDragging] = useState<{
    kind: VisualEdgeKind
    itemId: string
    handle: 'start' | 'end'
  } | null>(null)
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
  const visualEdgeDragRef = useRef<any>(null)
  const timelineHandleHistoryPausedRef = useRef(false)
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
    const st = useManifestStore.getState()
    targets.add(st.playbackTime)
    for (const a of audios) {
      for (const m of a.marks) {
        targets.add(a.startTime + (m.t - a.trimStart))
      }
    }
    for (const v of videos) {
      const start = v.timestamp
      for (const k of v.keyframes ?? []) {
        targets.add(start + k.t)
      }
    }
    for (const img of images) {
      for (const k of img.keyframes ?? []) {
        targets.add(img.startTime + k.t)
      }
    }
    const addEdges = (id: string, start: number, end: number) => {
      if (id === excludeId) return
      targets.add(start)
      targets.add(end)
    }
    for (const v of videos) {
      addEdges(v.id, v.timestamp, v.timestamp + (v.duration ?? 0))
    }
    for (const img of images) {
      addEdges(img.id, img.startTime, img.endTime)
    }
    for (const t of texts) {
      addEdges(t.id, t.startTime, t.endTime)
    }
    for (const a of audios) {
      if (a.id === excludeId) continue
      targets.add(a.startTime)
      const activeDur = (a.originalDuration - a.trimStart - a.trimEnd) / (a.playbackSpeed ?? 1)
      targets.add(a.startTime + activeDur)
    }
    for (const e of st.effects) {
      addEdges(e.id, e.startTime, e.endTime)
    }
    return Array.from(targets)
  }, [videos, images, texts, audios])

  const getRowItems = useCallback(
    (row: number, excludeType?: TimelineItemType, excludeId?: string, includeShift = false): RowItem[] => {
      const st = useManifestStore.getState()
      const items: RowItem[] = []
      const skip = (t: TimelineItemType, id: string) => excludeType === t && excludeId === id
      for (const v of st.videos) {
        if (v.row !== row || skip('video', v.id)) continue
        items.push({
          type: 'video',
          id: v.id,
          start: v.timestamp,
          end: v.timestamp + (v.duration ?? 0),
          shift: includeShift ? (amount: number) => st.updateVideo(v.id, { timestamp: v.timestamp + amount }) : undefined,
        })
      }
      for (const img of st.images) {
        if (img.row !== row || skip('image', img.id)) continue
        items.push({
          type: 'image',
          id: img.id,
          start: img.startTime,
          end: img.endTime,
          shift: includeShift
            ? (amount: number) => st.updateImage(img.id, { startTime: img.startTime + amount, endTime: img.endTime + amount })
            : undefined,
        })
      }
      for (const t of st.texts) {
        if (t.row !== row || skip('text', t.id)) continue
        items.push({
          type: 'text',
          id: t.id,
          start: t.startTime,
          end: t.endTime,
          shift: includeShift
            ? (amount: number) => st.updateText(t.id, { startTime: t.startTime + amount, endTime: t.endTime + amount })
            : undefined,
        })
      }
      for (const e of st.effects) {
        if (e.row !== row || skip('effect', e.id)) continue
        items.push({
          type: 'effect',
          id: e.id,
          start: e.startTime,
          end: e.endTime,
          shift: includeShift
            ? (amount: number) => st.updateEffect(e.id, { startTime: e.startTime + amount, endTime: e.endTime + amount })
            : undefined,
        })
      }
      for (const a of st.audios) {
        if (a.row !== row || skip('audio', a.id)) continue
        items.push({
          type: 'audio',
          id: a.id,
          start: a.startTime,
          end: a.endTime,
          shift: includeShift
            ? (amount: number) => st.updateAudio(a.id, { startTime: a.startTime + amount, endTime: a.endTime + amount })
            : undefined,
        })
      }
      return items
    },
    []
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
      const { pressClientX, pressClientY, initialStartTime, duration, itemType, itemId, initialRow } = drag
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

      const pointerStayedOnInitialRow = Math.abs(clientY - pressClientY) <= ROW_SWITCH_SLOP_PX
      if (lockTargetRowToInitial || pointerStayedOnInitialRow) {
        targetRow = initialRow
      } else {
        const st = useManifestStore.getState()
        const maxOverlayRow = getMaxOverlayRow(st)
        const resolved = resolveTargetRow(rowElements, clientY, itemType, initialRow, maxOverlayRow)
        targetRow = resolved.targetRow
        isInsertion = resolved.isInsertion
      }

      const threshold = 0.01
      const myStart = targetTime
      const myEnd = targetTime + duration
      if (!lockTargetRowToInitial && !isInsertion && targetRow >= 0) {
        const st = useManifestStore.getState()
        const intervals = occupancyIntervalsOnRow(st, targetRow, itemType, itemId)
        if (overlapsAny(myStart, myEnd, intervals, threshold)) {
          isValid = false
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

  const beginVisualEdgeDrag = useCallback(
    (
      kind: VisualEdgeKind,
      itemId: string,
      e: React.MouseEvent,
      handle: 'start' | 'end',
      getItem: () => VisualEdgeDragItem | undefined
    ) => {
      e.stopPropagation()
      e.preventDefault()
      const item = getItem()
      if (!item || !timelineRowRef.current) return
      useManifestStore.getState().pauseHistory()
      timelineHandleHistoryPausedRef.current = true
      setVisualEdgeDragging({ kind, itemId, handle })
      visualEdgeDragRef.current = {
        initialMouseX: e.clientX,
        initialStartTime: item.startTime,
        initialEndTime: item.endTime,
        timelineWidth: timelineRowRef.current.getBoundingClientRect().width,
      }
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
      const newTimestamp = Math.max(0, initialTimestamp + actualSourceDelta / playbackSpeed)
      const newDuration = (originalDuration - newTrimStart - initialTrimEnd) / playbackSpeed
      const stTrimStart = useManifestStore.getState()
      if (
        overlapsAny(
          newTimestamp,
          newTimestamp + newDuration,
          occupancyIntervalsOnRow(stTrimStart, video.row, 'video', trimDragging.videoId),
          0.01
        )
      ) {
        return
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
      const stTrimEnd = useManifestStore.getState()
      if (
        overlapsAny(
          video.timestamp,
          newEnd,
          occupancyIntervalsOnRow(stTrimEnd, video.row, 'video', trimDragging.videoId),
          0.01
        )
      ) {
        return
      }
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
      const activeDurStart = (originalDuration - newTrimStart - initialTrimEnd) / playbackSpeed
      const stStart = useManifestStore.getState()
      if (
        overlapsAny(
          newStartTime,
          newStartTime + activeDurStart,
          occupancyIntervalsOnRow(stStart, audio.row, 'audio', audioTrimDragging.audioId),
          0.01
        )
      ) {
        return
      }
      trimAudio(audioTrimDragging.audioId, newTrimStart, initialTrimEnd, newStartTime)
    } else {
      let newTrimEnd = initialTrimEnd - mouseDeltaTime * playbackSpeed
      newTrimEnd = Math.max(0, Math.min(newTrimEnd, originalDuration - initialTrimStart - (minDuration * playbackSpeed)))
      let activeDur = (originalDuration - initialTrimStart - newTrimEnd) / playbackSpeed
      let currentEndTime = audio.startTime + activeDur
      const snapped = snapToMarkers(currentEndTime, targets, snapThresholdSec)
      if (snapped !== currentEndTime) {
        const newActiveDur = snapped - audio.startTime
        newTrimEnd = originalDuration - initialTrimStart - newActiveDur * playbackSpeed
        activeDur = newActiveDur
        currentEndTime = snapped
      }
      const stEnd = useManifestStore.getState()
      if (
        overlapsAny(
          audio.startTime,
          currentEndTime,
          occupancyIntervalsOnRow(stEnd, audio.row, 'audio', audioTrimDragging.audioId),
          0.01
        )
      ) {
        return
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
      beginVisualEdgeDrag('image', imageId, e, handle, () => images.find((o) => o.id === imageId))
    },
    [images, scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

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
      beginVisualEdgeDrag('text', textId, e, handle, () => texts.find((t) => t.id === textId))
    },
    [texts, scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

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
      beginVisualEdgeDrag('effect', effectId, e, handle, () =>
        useManifestStore.getState().effects.find((f) => f.id === effectId)
      )
    },
    [scheduleVisualMoveStart, beginVisualEdgeDrag]
  )

  const handleVisualEdgeDragMove = useCallback(
    (e: MouseEvent) => {
      if (!visualEdgeDragging || !visualEdgeDragRef.current) return
      const { kind, itemId, handle } = visualEdgeDragging
      const { initialMouseX, initialStartTime, initialEndTime, timelineWidth } = visualEdgeDragRef.current
      const st = useManifestStore.getState()
      const item =
        kind === 'image'
          ? st.images.find((i) => i.id === itemId)
          : kind === 'text'
            ? st.texts.find((t) => t.id === itemId)
            : st.effects.find((f) => f.id === itemId)
      if (!item) return
      const totalWithPadding = totalDuration + effectivePadding * 2
      const timeDelta = toTimeDelta(e.clientX, initialMouseX, timelineWidth, totalWithPadding)
      const targets = getSnapTargets(itemId)
      const minDur = 0.1
      const updates = computeVisualItemDrag({
        handle,
        initialStartTime,
        initialEndTime,
        currentStartTime: item.startTime,
        timeDelta,
        targets,
        minDuration: minDur,
        bounds: {
          minStart: 0,
          maxStart: initialEndTime - minDur,
          minEnd: item.startTime + minDur,
        },
      })
      const nextStart = updates.startTime ?? item.startTime
      const nextEnd = updates.endTime ?? item.endTime
      const rowIntervals = getRowItems(item.row, kind, itemId).map((rowItem) => ({
        start: rowItem.start,
        end: rowItem.end,
      }))
      const excludeType: TimelineItemType = kind
      const canRippleEndExpansion =
        handle === 'end' &&
        item.row >= 0 &&
        updates.endTime !== undefined &&
        updates.endTime > initialEndTime &&
        shouldRippleExpansionInRow(item.row, initialEndTime, updates.endTime, excludeType, itemId)
      if (kind === 'image' || kind === 'text' || kind === 'effect') {
        if (
          overlapsAny(nextStart, nextEnd, rowIntervals, 0.01) &&
          !canRippleEndExpansion
        ) {
          return
        }
      }
      if (canRippleEndExpansion) {
        shiftItemsForwardInRow(item.row, initialEndTime, updates.endTime - initialEndTime, excludeType, itemId)
      }
      if (kind === 'image') updateImage(itemId, updates)
      else if (kind === 'text') updateText(itemId, updates)
      else updateEffect(itemId, updates)
    },
    [
      visualEdgeDragging,
      totalDuration,
      effectivePadding,
      updateImage,
      updateText,
      updateEffect,
      getSnapTargets,
      computeVisualItemDrag,
      getRowItems,
      shiftItemsForwardInRow,
      shouldRippleExpansionInRow,
    ]
  )

  const handleVisualEdgeDragEnd = useCallback(() => {
    endDragWithHistory(
      () => setVisualEdgeDragging(null),
      () => {
        visualEdgeDragRef.current = null
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
  useDocumentDragListeners(Boolean(visualEdgeDragging), handleVisualEdgeDragMove, handleVisualEdgeDragEnd)

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
    handleTrimStart,
    handleAudioTrimStart,
    handleAudioBodyDragStart,
    handleImageDragStart,
    handleOverlayVideoDragStart,
    handleTextDragStart,
    handleEffectDragStart
  }
}
