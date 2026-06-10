import { describe, it, expect } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import {
  getSortedRowItems,
  clipsTransitionLayoutCompatible,
  checkTransition,
  findActiveAndNextItems,
} from '@/app/lib/renderUtils'

function makeVideo(
  id: string,
  row: number,
  timestamp: number,
  duration: number,
  opts?: { width?: number; height?: number; transition?: string; transitionDuration?: number }
) {
  const w = opts?.width ?? 1080
  const h = opts?.height ?? 1920
  return new VideoClass(
    id,
    't',
    undefined,
    duration,
    timestamp,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    0,
    0,
    w,
    h,
    1,
    'none',
    opts?.transition ?? 'none',
    0,
    opts?.transitionDuration,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    row,
    false,
    '9:16',
    0,
    0,
    1,
    1,
    undefined,
    undefined,
    undefined,
    1,
    1,
    1,
    'linear',
    []
  )
}

function makeImage(id: string, row: number, start: number, end: number) {
  return new ImageClass(
    id,
    'n',
    'https://example.com/x.png',
    start,
    end,
    0,
    0,
    1080,
    1920,
    1,
    undefined,
    'none',
    'none',
    '9:16',
    0,
    0,
    1,
    1,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    row,
    0,
    []
  )
}

describe('getSortedRowItems', () => {
  it('merges videos and images on a row sorted by start time', () => {
    const v1 = makeVideo('v1', 2, 1, 2)
    const v2 = makeVideo('v2', 2, 5, 1)
    const i1 = makeImage('i1', 2, 3.5, 4.5)
    const sorted = getSortedRowItems(2, [v2, v1], [i1])
    expect(sorted.map((s) => s.id)).toEqual(['v1', 'i1', 'v2'])
  })
})

describe('clipsTransitionLayoutCompatible', () => {
  it('returns true for matching placement and crop', () => {
    const a = makeVideo('a', 0, 0, 1)
    const b = makeVideo('b', 0, 2, 1)
    expect(clipsTransitionLayoutCompatible(a, b)).toBe(true)
  })

  it('returns false when width differs', () => {
    const a = makeVideo('a', 0, 0, 1)
    const b = makeVideo('b', 0, 2, 1, { width: 800 })
    expect(clipsTransitionLayoutCompatible(a, b)).toBe(false)
  })
})

describe('checkTransition with layout guard', () => {
  it('disables transition when layouts differ', () => {
    const a = makeVideo('a', 0, 0, 2)
    const b = makeVideo('b', 0, 2, 2, { width: 800, transition: 'fade', transitionDuration: 1 })
    const items = [
      { id: a.id, type: 'video' as const, item: a, startTime: a.timestamp, duration: a.duration || 0 },
      { id: b.id, type: 'video' as const, item: b, startTime: b.timestamp, duration: b.duration || 0 },
    ]
    const atCut = b.timestamp - 0.05
    const r = checkTransition(items[0], items[1], atCut)
    expect(r.transitionActive).toBe(false)
  })

  it('disables transition when clips are not adjacent', () => {
    const a = makeVideo('a', 0, 0, 2)
    const b = makeVideo('b', 0, 2.3, 2, { transition: 'wipe', transitionDuration: 1 })
    const atEndOfA = 1.9
    const r = checkTransition(
      { id: a.id, type: 'video', item: a, startTime: a.timestamp, duration: a.duration || 0 },
      { id: b.id, type: 'video', item: b, startTime: b.timestamp, duration: b.duration || 0 },
      atEndOfA
    )
    expect(r.transitionActive).toBe(false)
  })
})

describe('findActiveAndNextItems flash layout guard', () => {
  it('remaps to previous clip during flash second half even when layout mismatches', () => {
    const prev = makeVideo('p', 0, 0, 2)
    const cur = makeVideo('c', 0, 2, 2, { width: 400, transition: 'flash', transitionDuration: 2 })
    const items = [
      { id: prev.id, type: 'video' as const, item: prev, startTime: prev.timestamp, duration: prev.duration || 0 },
      { id: cur.id, type: 'video' as const, item: cur, startTime: cur.timestamp, duration: cur.duration || 0 },
    ]
    const t = cur.timestamp + 0.1
    const { activeItem, nextItem } = findActiveAndNextItems(items, t)
    expect(activeItem?.id).toBe('p')
    expect(nextItem?.id).toBe('c')
  })
})
