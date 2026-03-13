import { useState, useEffect, useRef } from 'react'
import { generateVideoThumbnails } from '@/app/lib/mediaUtils'
import { VideoClass } from '@/app/models/VideoClass'

export function useVideoThumbnails(videos: VideoClass[]) {
  const [videoThumbnails, setVideoThumbnails] = useState<Map<string, Map<number, string>>>(new Map())
  const processingUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const activeUrls = new Set(videos.map(v => v.url).filter(Boolean))
    setVideoThumbnails(prev => {
      let changed = false
      const next = new Map(prev)
      for (const url of Array.from(next.keys())) {
        if (!activeUrls.has(url as string)) {
          next.delete(url as string)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [videos])

  useEffect(() => {
    const neededByUrl = new Map<string, Set<number>>()
    videos.forEach((v) => {
      if (!v.url) return
      if (!neededByUrl.has(v.url)) neededByUrl.set(v.url, new Set())
      const set = neededByUrl.get(v.url)!
      const start = Math.floor(v.trimStart)
      const duration = v.duration ?? 0
      const end = Math.ceil(v.trimStart + duration)
      for (let s = start; s <= end; s++) {
        set.add(s)
      }
    })

    neededByUrl.forEach(async (neededSeconds, url) => {
      const existing = videoThumbnails.get(url)
      const missing = Array.from(neededSeconds).filter((s) => !existing || !existing.has(s))
      
      if (missing.length === 0) return
      if (processingUrlsRef.current.has(url)) return
      processingUrlsRef.current.add(url)

      try {
        await generateVideoThumbnails(url, missing, (time, data) => {
          setVideoThumbnails((prev) => {
            const next = new Map(prev)
            const urlMap = new Map(next.get(url) || [])
            urlMap.set(time, data)
            next.set(url, urlMap)
            return next
          })
        })
      } finally {
        processingUrlsRef.current.delete(url)
      }
    })
  }, [videos, videoThumbnails])

  return { videoThumbnails, setVideoThumbnails }
}
