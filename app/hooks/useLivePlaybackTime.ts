'use client'

import { useSyncExternalStore } from 'react'
import {
  getLivePlaybackTimeSnapshot,
  subscribeThrottledLivePlayback,
} from '@/app/lib/playbackClock'

export function useLivePlaybackTime(fps = 12) {
  return useSyncExternalStore(
    (onStoreChange) => subscribeThrottledLivePlayback(onStoreChange, fps),
    getLivePlaybackTimeSnapshot,
    getLivePlaybackTimeSnapshot
  )
}
