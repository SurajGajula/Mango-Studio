import { useState, useEffect, useRef } from 'react'
import { generateVideoThumbnails, revokeThumbnailUrls } from '@/app/lib/mediaUtils'
import { VideoClass } from '@/app/models/VideoClass'
import {
  videoThumbnailCacheKey,
  videoThumbnailPrioritySecondIndices,
  videoThumbnailSecondIndices,
} from '@/app/lib/videoThumbnailKey'

type ThumbnailWork = {
  cacheKey: string
  seconds: number[]
}

function collectThumbnailWork(videos: VideoClass[]): ThumbnailWork[] {
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
  return Array.from(neededByKey.entries()).map(([cacheKey, seconds]) => ({
    cacheKey,
    seconds: Array.from(seconds).sort((a, b) => a - b),
  }))
}

function priorityWorkForVideos(videos: VideoClass[]): ThumbnailWork[] {
  const neededByKey = new Map<string, Set<number>>()
  videos.forEach((v) => {
    const key = videoThumbnailCacheKey(v)
    if (!key) return
    const seconds = videoThumbnailPrioritySecondIndices(v)
    if (seconds.length === 0) return
    if (!neededByKey.has(key)) neededByKey.set(key, new Set())
    const set = neededByKey.get(key)!
    for (const s of seconds) {
      set.add(s)
    }
  })
  return Array.from(neededByKey.entries()).map(([cacheKey, seconds]) => ({
    cacheKey,
    seconds: Array.from(seconds).sort((a, b) => a - b),
  }))
}

export function useVideoThumbnails(videos: VideoClass[]) {
  const [videoThumbnails, setVideoThumbnails] = useState<Map<string, Map<number, string>>>(new Map())
  const processingKeysRef = useRef<Set<string>>(new Set())
  const videoThumbnailsRef = useRef(videoThumbnails)
  videoThumbnailsRef.current = videoThumbnails

  useEffect(() => {
    let cancelled = false
    let idleId = 0
    let timeoutId = 0

    const pruneInactiveKeys = (activeKeys: Set<string>) => {
      setVideoThumbnails((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const key of next.keys()) {
          if (!activeKeys.has(key)) {
            revokeThumbnailUrls(next.get(key))
            next.delete(key)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }

    const missingSeconds = (cacheKey: string, seconds: number[]) => {
      const existing = videoThumbnailsRef.current.get(cacheKey)
      return seconds.filter((s) => !existing?.has(s))
    }

    const generateForWork = async (work: ThumbnailWork[]) => {
      for (const { cacheKey, seconds } of work) {
        if (cancelled) return
        const missing = missingSeconds(cacheKey, seconds)
        if (missing.length === 0) continue
        if (processingKeysRef.current.has(cacheKey)) continue
        processingKeysRef.current.add(cacheKey)
        try {
          await generateVideoThumbnails(cacheKey, missing, (time, data) => {
            if (cancelled) {
              if (data.startsWith('blob:')) URL.revokeObjectURL(data)
              return
            }
            setVideoThumbnails((prev) => {
              const next = new Map(prev)
              const urlMap = new Map(next.get(cacheKey) || [])
              const previous = urlMap.get(time)
              if (previous && previous.startsWith('blob:') && previous !== data) {
                URL.revokeObjectURL(previous)
              }
              urlMap.set(time, data)
              next.set(cacheKey, urlMap)
              return next
            })
          })
        } finally {
          processingKeysRef.current.delete(cacheKey)
        }
      }
    }

    const run = async () => {
      if (cancelled) return

      const fullWork = collectThumbnailWork(videos)
      const activeKeys = new Set(fullWork.map((w) => w.cacheKey))
      pruneInactiveKeys(activeKeys)

      const priorityWork = priorityWorkForVideos(videos)
      await generateForWork(priorityWork)
      if (cancelled) return

      const deferFull = () => {
        if (cancelled) return
        const remaining = fullWork
          .map(({ cacheKey, seconds }) => ({
            cacheKey,
            seconds: missingSeconds(cacheKey, seconds),
          }))
          .filter((w) => w.seconds.length > 0)
        void generateForWork(remaining)
      }

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(deferFull, { timeout: 8000 })
      } else {
        window.setTimeout(deferFull, 2000)
      }
    }

    const schedule = () => {
      if (cancelled) return
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(() => void run(), { timeout: 4000 })
      } else {
        timeoutId = window.setTimeout(() => void run(), 1500)
      }
    }

    if (document.readyState === 'complete') {
      schedule()
    } else {
      window.addEventListener('load', schedule, { once: true })
    }

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleId) cancelIdleCallback(idleId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [videos])

  useEffect(() => {
    return () => {
      for (const urlMap of videoThumbnailsRef.current.values()) {
        revokeThumbnailUrls(urlMap)
      }
    }
  }, [])

  return { videoThumbnails, setVideoThumbnails }
}
