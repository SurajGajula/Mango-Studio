'use client'

import { useEffect, useRef } from 'react'
import type { VideoClass } from '@/app/models/VideoClass'
import { ensureProxiesForVideos } from '@/app/lib/mediaProxy'
import { videoFullResMediaUrl } from '@/app/lib/videoPlaybackSource'

export function useEnsureVideoProxies(videos: VideoClass[]) {
  const keyRef = useRef('')
  useEffect(() => {
    const key = videos
      .map((video) => `${video.id}:${videoFullResMediaUrl(video)}:${video.proxyUrl ?? ''}`)
      .join('|')
    if (key === keyRef.current) return
    keyRef.current = key
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await ensureProxiesForVideos(videos)
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(() => {
        void run()
      }, { timeout: 2500 })
      return () => {
        cancelled = true
        cancelIdleCallback(idleId)
      }
    }
    const timeoutId = window.setTimeout(() => {
      void run()
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [videos])
}
