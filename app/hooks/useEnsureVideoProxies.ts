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
    let cancelled = false
    let idleId = 0
    let timeoutId = 0

    const run = async () => {
      if (cancelled || document.visibilityState === 'hidden') return
      keyRef.current = key
      await ensureProxiesForVideos(videos)
    }

    const schedule = () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') return
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(() => {
          void run()
        }, { timeout: 2500 })
      } else {
        timeoutId = window.setTimeout(() => {
          void run()
        }, 400)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule()
    }

    if (document.visibilityState === 'visible') {
      schedule()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (idleId) cancelIdleCallback(idleId)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [videos])
}
