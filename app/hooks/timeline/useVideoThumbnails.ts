import { useState, useEffect, useRef } from 'react'
import { generateVideoThumbnails } from '@/app/lib/mediaUtils'
import { VideoClass } from '@/app/models/VideoClass'
import { videoThumbnailCacheKey, videoThumbnailSecondIndices } from '@/app/lib/videoThumbnailKey'

export function useVideoThumbnails(videos: VideoClass[]) {
  const [videoThumbnails, setVideoThumbnails] = useState<Map<string, Map<number, string>>>(new Map())
  const processingKeysRef = useRef<Set<string>>(new Set())
  const videoThumbnailsRef = useRef(videoThumbnails)
  videoThumbnailsRef.current = videoThumbnails

  useEffect(() => {
    const neededByKey = new Map<string, Set<number>>()
    videos.forEach((v) => {
      const key = videoThumbnailCacheKey(v)
      if (!key) return
      const seconds = videoThumbnailSecondIndices(v)
      if (seconds.length === 0) return
      if (!neededByKey.has(key)) neededByKey.set(key, new Set())
      const set = neededByKey.get(key)!
      for (const s of seconds) {
        set.add(s)
      }
    })

    neededByKey.forEach(async (neededSeconds, cacheKey) => {
      const existing = videoThumbnailsRef.current.get(cacheKey)
      const missing = Array.from(neededSeconds).filter((s) => !existing || !existing.has(s))

      if (missing.length === 0) return
      if (processingKeysRef.current.has(cacheKey)) return
      processingKeysRef.current.add(cacheKey)

      try {
        await generateVideoThumbnails(cacheKey, missing, (time, data) => {
          setVideoThumbnails((prev) => {
            const next = new Map(prev)
            const urlMap = new Map(next.get(cacheKey) || [])
            urlMap.set(time, data)
            next.set(cacheKey, urlMap)
            return next
          })
        })
      } finally {
        processingKeysRef.current.delete(cacheKey)
      }
    })
  }, [videos])

  return { videoThumbnails, setVideoThumbnails }
}
