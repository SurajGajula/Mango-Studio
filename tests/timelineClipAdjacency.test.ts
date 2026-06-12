import { describe, expect, it } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import {
  TIMELINE_CLIP_GAP_EPSILON,
  clipsAreEffectivelyAdjacent,
  getSortedRowClips,
  isRowClipActiveAtTimelineTime,
  rowClipEffectiveTimelineEnd,
  rowClipElapsedAtTime,
} from '@/app/lib/timelineClipAdjacency'
import { findActiveAndNextItems, checkTransition } from '@/app/lib/renderUtils'

function makeVideo(id: string, row: number, timestamp: number, duration: number) {
  return new VideoClass(id, 'clip', `/x-${id}.mp4`, duration, timestamp, undefined, undefined, duration, 0, 0, undefined, 0, 0, 1080, 1920, 1, 'none', 'none', 0, 1, 1, undefined, undefined, undefined, undefined, undefined, undefined, row)
}

function makeImage(id: string, row: number, start: number, end: number) {
  return new ImageClass(id, 'img', `https://example.com/${id}.png`, start, end, 0, 0, 1080, 1920, 1, undefined, 'none', 'none', '9:16', 0, 0, 1, 1, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, row, 0, [])
}

describe('timelineClipAdjacency', () => {
  it('extends active range across a few-frame gap between image and video', () => {
    const image = makeImage('i1', 0, 0, 2)
    const video = makeVideo('v1', 0, 2 + 2 / 60, 2)
    const rowItems = getSortedRowClips(0, [video], [image])
    const gapTime = 2 + 1 / 60
    expect(isRowClipActiveAtTimelineTime(rowItems, rowItems[0], gapTime, [video])).toBe(true)
    expect(isRowClipActiveAtTimelineTime(rowItems, rowItems[1], gapTime, [video])).toBe(false)
    expect(rowClipEffectiveTimelineEnd(rowItems, rowItems[0], [video])).toBeCloseTo(video.timestamp, 5)
  })

  it('does not bridge gaps larger than the fill epsilon', () => {
    const a = makeVideo('a', 0, 0, 2)
    const b = makeVideo('b', 0, 2 + TIMELINE_CLIP_GAP_EPSILON + 0.01, 2)
    const rowItems = getSortedRowClips(0, [a, b], [])
    const gapTime = 2 + TIMELINE_CLIP_GAP_EPSILON * 0.5
    expect(isRowClipActiveAtTimelineTime(rowItems, rowItems[0], gapTime, [a, b])).toBe(false)
    expect(clipsAreEffectivelyAdjacent(rowItems[0], rowItems[1])).toBe(false)
  })

  it('keeps the previous clip active in findActiveAndNextItems during a small gap', () => {
    const image = makeImage('i1', 0, 0, 2)
    const video = makeVideo('v1', 0, 2 + 1 / 60, 2)
    const items = getSortedRowClips(0, [video], [image])
    const gapTime = 2 + 0.5 / 60
    const { activeItem, nextItem } = findActiveAndNextItems(items, gapTime, [video])
    expect(activeItem?.id).toBe('i1')
    expect(nextItem?.id).toBe('v1')
  })

  it('clamps elapsed time to clip duration while filling a gap', () => {
    const image = makeImage('i1', 0, 0, 2)
    const rowItem = { id: image.id, type: 'image' as const, startTime: image.startTime, duration: image.duration, item: image }
    const gapTime = 2 + 1 / 60
    expect(rowClipElapsedAtTime(rowItem, gapTime)).toBeCloseTo(2, 5)
  })

  it('treats few-frame gaps as adjacent for transitions', () => {
    const a = makeVideo('a', 0, 0, 2)
    const b = makeVideo('b', 0, 2 + 2 / 60, 2).copy({ transition: 'fade', transitionDuration: 1 })
    const items = getSortedRowClips(0, [a, b], [])
    const tr = checkTransition(items[0], items[1], 1.95)
    expect(tr.transitionActive).toBe(true)
  })
})
