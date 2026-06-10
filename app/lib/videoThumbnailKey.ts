import type { VideoClass } from '@/app/models/VideoClass'

export const MAX_THUMBNAIL_SAMPLES_PER_CLIP = 72
export const PRIORITY_THUMBNAIL_SAMPLES_PER_CLIP = 6

export function subsampleThumbnailSecondIndices(seconds: number[], maxSamples: number): number[] {
  if (seconds.length <= maxSamples) return seconds
  const out: number[] = []
  const step = (seconds.length - 1) / (maxSamples - 1)
  for (let i = 0; i < maxSamples; i++) {
    out.push(seconds[Math.floor(i * step)])
  }
  return out
}

export function videoThumbnailPrioritySecondIndices(v: VideoClass): number[] {
  return subsampleThumbnailSecondIndices(
    videoThumbnailSecondIndices(v),
    PRIORITY_THUMBNAIL_SAMPLES_PER_CLIP
  )
}

export function videoThumbnailCacheKey(v: VideoClass): string | undefined {
  if (v.sourceUrl && v.url && v.url !== v.sourceUrl) return v.sourceUrl
  return v.url
}

export function videoThumbnailTimeBase(v: VideoClass): number {
  if (v.sourceUrl && v.url && v.url !== v.sourceUrl) {
    return v.sourceTrimStart ?? 0
  }
  return v.trimStart
}

export function videoThumbnailSecondIndices(v: VideoClass): number[] {
  const key = videoThumbnailCacheKey(v)
  if (!key) return []
  const base = videoThumbnailTimeBase(v)
  const duration = v.duration ?? 0
  const start = Math.floor(base)
  const endEx = Math.ceil(base + duration)
  const span = Math.max(0, endEx - start)
  if (span === 0) return []
  if (span <= MAX_THUMBNAIL_SAMPLES_PER_CLIP) {
    const out: number[] = []
    for (let s = start; s < endEx; s++) {
      out.push(s)
    }
    return out
  }
  const out: number[] = []
  const step = span / MAX_THUMBNAIL_SAMPLES_PER_CLIP
  for (let i = 0; i < MAX_THUMBNAIL_SAMPLES_PER_CLIP; i++) {
    out.push(start + Math.floor(i * step))
  }
  return out
}
