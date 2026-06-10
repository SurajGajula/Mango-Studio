import type { TextWordTiming } from '@/app/models/TextClass'

export const SPEECH_CAPTION_HOLD_SECONDS = 0.35

export function captionClipEndTime(
  clipStartTime: number,
  segmentEndTime: number,
  wordTimings?: TextWordTiming[]
): number {
  const lastWordEnd =
    wordTimings && wordTimings.length > 0
      ? clipStartTime + wordTimings[wordTimings.length - 1].endTime
      : segmentEndTime
  return Math.max(segmentEndTime, lastWordEnd) + SPEECH_CAPTION_HOLD_SECONDS
}

export function getKeyboardVisibleWordCount(
  content: string,
  startTime: number,
  endTime: number,
  t: number
): number {
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  const duration = endTime - startTime
  if (words.length === 0) return 0
  if (duration <= 0) return words.length
  const wordDuration = duration / words.length
  const elapsed = t - startTime
  return Math.max(1, Math.min(words.length, Math.floor(elapsed / wordDuration) + 1))
}

export function getSpeechVisibleWordCount(
  wordTimings: TextWordTiming[],
  clipStartTime: number,
  t: number,
  contentWordCount?: number
): number {
  if (wordTimings.length === 0) return 0
  let count = 0
  for (const word of wordTimings) {
    if (t >= clipStartTime + word.startTime) count++
    else break
  }
  if (contentWordCount !== undefined && count >= wordTimings.length) {
    return contentWordCount
  }
  return count
}

export function getVisibleWordCount(
  content: string,
  startTime: number,
  endTime: number,
  t: number,
  animation: 'none' | 'keyboard' | 'speech' | 'shake',
  wordTimings?: TextWordTiming[]
): number | null {
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return null
  if (animation === 'speech') {
    if (wordTimings && wordTimings.length > 0) {
      return getSpeechVisibleWordCount(wordTimings, startTime, t, words.length)
    }
    return getKeyboardVisibleWordCount(content, startTime, endTime, t)
  }
  if (animation === 'keyboard') {
    return getKeyboardVisibleWordCount(content, startTime, endTime, t)
  }
  return null
}

export function getKeyboardVisibleContent(
  content: string,
  startTime: number,
  endTime: number,
  t: number
): string {
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return content
  const visibleCount = getKeyboardVisibleWordCount(content, startTime, endTime, t)
  return words.slice(0, visibleCount).join(' ')
}

export function getAnimatedVisibleContent(
  content: string,
  startTime: number,
  endTime: number,
  t: number,
  animation: 'none' | 'keyboard' | 'speech' | 'shake',
  wordTimings?: TextWordTiming[]
): string {
  const visibleCount = getVisibleWordCount(content, startTime, endTime, t, animation, wordTimings)
  if (visibleCount === null) return content
  const words = content.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return content
  return words.slice(0, visibleCount).join(' ')
}

export function sliceWordTimingsForClip(
  wordTimings: TextWordTiming[] | undefined,
  clipStart: number,
  clipEnd: number,
  originalClipStart: number
): TextWordTiming[] | undefined {
  if (!wordTimings || wordTimings.length === 0) return undefined
  const sliced = wordTimings
    .filter((w) => {
      const absoluteStart = originalClipStart + w.startTime
      return absoluteStart >= clipStart && absoluteStart < clipEnd
    })
    .map((w) => {
      const absoluteStart = originalClipStart + w.startTime
      const absoluteEnd = originalClipStart + w.endTime
      return {
        text: w.text,
        startTime: absoluteStart - clipStart,
        endTime: Math.min(absoluteEnd, clipEnd) - clipStart,
      }
    })
  return sliced.length > 0 ? sliced : undefined
}

function breakWordToFit(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  word: string,
  maxWidth: number
): string[] {
  if (ctx.measureText(word).width <= maxWidth) return [word]
  const parts: string[] = []
  let current = ''
  for (const ch of word) {
    const next = current + ch
    if (ctx.measureText(next).width > maxWidth && current) {
      parts.push(current)
      current = ch
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts.length > 0 ? parts : [word]
}

export function wrapTextToLines(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let current = ''
    for (const word of words) {
      const wordParts = breakWordToFit(ctx, word, maxWidth)
      for (const part of wordParts) {
        const candidate = current ? `${current} ${part}` : part
        if (ctx.measureText(candidate).width > maxWidth && current) {
          lines.push(current)
          current = part
        } else {
          current = candidate
        }
      }
    }
    lines.push(current)
  }
  return lines
}
