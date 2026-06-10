import { describe, expect, it } from 'vitest'
import {
  captionClipEndTime,
  getAnimatedVisibleContent,
  getSpeechVisibleWordCount,
  getVisibleWordCount,
  sliceWordTimingsForClip,
} from '@/app/lib/textUtils'

describe('speech text animation', () => {
  const wordTimings = [
    { text: 'Hello', startTime: 0, endTime: 0.4 },
    { text: 'world', startTime: 0.5, endTime: 0.9 },
    { text: 'today', startTime: 1.2, endTime: 1.8 },
  ]

  it('reveals words at speech timestamps instead of even spacing', () => {
    expect(getSpeechVisibleWordCount(wordTimings, 10, 9.99)).toBe(0)
    expect(getSpeechVisibleWordCount(wordTimings, 10, 10)).toBe(1)
    expect(getSpeechVisibleWordCount(wordTimings, 10, 10.49)).toBe(1)
    expect(getSpeechVisibleWordCount(wordTimings, 10, 10.5)).toBe(2)
    expect(getSpeechVisibleWordCount(wordTimings, 10, 11.1)).toBe(2)
    expect(getSpeechVisibleWordCount(wordTimings, 10, 11.2)).toBe(3)
  })

  it('builds visible content from speech timings', () => {
    expect(
      getAnimatedVisibleContent('Hello world today', 10, 12, 10.6, 'speech', wordTimings)
    ).toBe('Hello world')
  })

  it('shows remaining content words once all timed words are visible', () => {
    const partialTimings = [
      { text: 'Hello', startTime: 0, endTime: 0.4 },
      { text: 'world', startTime: 0.5, endTime: 0.9 },
    ]
    expect(getSpeechVisibleWordCount(partialTimings, 10, 10.5, 3)).toBe(3)
  })

  it('extends caption clip end past the last spoken word', () => {
    const timings = [{ text: 'Hello', startTime: 0, endTime: 0.4 }]
    expect(captionClipEndTime(10, 10.5, timings)).toBeCloseTo(10.85, 5)
  })

  it('falls back to keyboard timing when speech has no word timings', () => {
    expect(getVisibleWordCount('one two', 0, 2, 0.5, 'speech')).toBe(1)
    expect(getVisibleWordCount('one two', 0, 2, 1.5, 'speech')).toBe(2)
  })

  it('slices word timings when splitting a caption clip', () => {
    const clipStart = 5
    const original = [
      { text: 'Hello', startTime: 0, endTime: 0.4 },
      { text: 'world', startTime: 0.5, endTime: 0.9 },
      { text: 'today', startTime: 1.2, endTime: 1.8 },
    ]
    const firstHalf = sliceWordTimingsForClip(original, clipStart, 5.6, clipStart)
    expect(firstHalf?.map((w) => w.text)).toEqual(['Hello', 'world'])
    expect(firstHalf?.[0].startTime).toBe(0)
    expect(firstHalf?.[1].endTime).toBeCloseTo(0.6, 5)
    const secondHalf = sliceWordTimingsForClip(original, 5.6, 6.8, clipStart)
    expect(secondHalf?.map((w) => w.text)).toEqual(['today'])
    expect(secondHalf?.[0].startTime).toBeCloseTo(0.6, 5)
    expect(secondHalf?.[0].endTime).toBeCloseTo(1.2, 5)
  })
})
