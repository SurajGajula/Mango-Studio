import { VideoClass } from '@/app/models/VideoClass'
import { videoThumbnailCacheKey, videoThumbnailSecondIndices } from '@/app/lib/videoThumbnailKey'

type BuildVideoStripArgs = {
  video: VideoClass
  videoThumbnails: Map<string, Map<number, string>>
}

export function buildVideoStripThumbnails({
  video,
  videoThumbnails,
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
  return thumbs
}
