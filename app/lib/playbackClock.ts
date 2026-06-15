import { useManifestStore } from '@/app/stores/manifestStore'

export const livePlaybackTimeRef = { current: 0 }
export const isTimelineScrubbingRef = { current: false }
export const isTimelinePlayDragRef = { current: false }

let previewEngineEnabled = false

export function isPreviewEngineEnabled() {
  return previewEngineEnabled
}

const previewWakeListeners = new Set<() => void>()
const previewVideoPurgeListeners = new Set<() => void>()

export function setLivePlaybackTime(time: number) {
  livePlaybackTimeRef.current = Math.max(0, time)
}

export function syncLivePlaybackFromStore() {
  livePlaybackTimeRef.current = useManifestStore.getState().playbackTime
}

export function commitLivePlaybackTimeToStore() {
  const apply = () => {
    const state = useManifestStore.getState()
    const next = livePlaybackTimeRef.current
    if (Math.abs(state.playbackTime - next) < 0.0005) return
    state.setPlaybackTime(next)
  }
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(apply)
  } else {
    apply()
  }
}

export function subscribePreviewWake(listener: () => void) {
  previewWakeListeners.add(listener)
  return () => {
    previewWakeListeners.delete(listener)
  }
}

export function wakePreviewLoop() {
  if (!previewEngineEnabled) return
  previewWakeListeners.forEach((listener) => listener())
}

export function enablePreviewEngine() {
  if (previewEngineEnabled) return
  previewEngineEnabled = true
  wakePreviewLoop()
}

export function subscribePreviewVideoPurge(listener: () => void) {
  previewVideoPurgeListeners.add(listener)
  return () => {
    previewVideoPurgeListeners.delete(listener)
  }
}

export function requestPreviewVideoPoolPurge() {
  previewVideoPurgeListeners.forEach((listener) => listener())
}

export function subscribeThrottledLivePlayback(
  callback: () => void,
  fps: number
) {
  const interval = 1 / fps
  let lastBucket = Number.NaN
  const onWake = () => {
    const bucket = Math.floor(livePlaybackTimeRef.current / interval)
    if (bucket === lastBucket) return
    lastBucket = bucket
    callback()
  }
  return subscribePreviewWake(onWake)
}

export function getLivePlaybackTimeSnapshot() {
  return livePlaybackTimeRef.current
}
