import type { VideoClass } from '@/app/models/VideoClass'

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
  const out: number[] = []
  for (let s = start; s < endEx; s++) {
    out.push(s)
  }
  return out
}
