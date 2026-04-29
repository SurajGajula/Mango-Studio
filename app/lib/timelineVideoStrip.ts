import { VideoClass } from '@/app/models/VideoClass'
import { videoThumbnailCacheKey, videoThumbnailSecondIndices } from '@/app/lib/videoThumbnailKey'

type BuildVideoStripArgs = {
  video: VideoClass
  videoThumbnails: Map<string, Map<number, string>>
  widthPercent: number
  timelineInnerWidthPx: number
  fallbackViewportWidthPx: number
  totalDuration: number
}

export function buildVideoStripThumbnails({
  video,
  videoThumbnails,
  widthPercent,
  timelineInnerWidthPx,
  fallbackViewportWidthPx,
  totalDuration,
}: BuildVideoStripArgs): string[] {
  const tKey = videoThumbnailCacheKey(video)
  if (!tKey) return []
  const allThumbs = videoThumbnails.get(tKey)
  if (!allThumbs || allThumbs.size === 0) return []

  const seconds = videoThumbnailSecondIndices(video)
  const thumbs: string[] = []
  for (const second of seconds) {
    const data = allThumbs.get(second)
    if (data) thumbs.push(data)
  }
  if (thumbs.length === 0) return []

  const thumbWidth = 85
  const innerPx =
    timelineInnerWidthPx > 0
      ? timelineInnerWidthPx
      : fallbackViewportWidthPx * Math.max(1, totalDuration / 8)
  const itemWidthPx = (widthPercent / 100) * innerPx
  const totalThumbsWidth = thumbs.length * thumbWidth
  const repeatCount = Math.max(1, Math.ceil(itemWidthPx / totalThumbsWidth))
  const repeatedThumbs: string[] = []
  for (let r = 0; r < repeatCount; r += 1) {
    repeatedThumbs.push(...thumbs)
  }
  return repeatedThumbs
}
