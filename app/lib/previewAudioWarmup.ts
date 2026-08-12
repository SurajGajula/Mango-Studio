import { isPlaybackFetchableUrl } from '@/app/lib/persistedMediaRefs'
import { useManifestStore } from '@/app/stores/manifestStore'

const AUDIO_WARM_TIMEOUT_MS = 2000
const AUDIO_PREFETCH_BEFORE_SEC = 12
const AUDIO_KEEP_AFTER_SEC = 2

function warmAudioUrl(url: string, seekTo: number): Promise<void> {
  return new Promise((resolve) => {
    const el = new Audio()
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      el.removeEventListener('canplaythrough', finish)
      el.removeEventListener('canplay', finish)
      el.removeEventListener('error', finish)
      try {
        el.removeAttribute('src')
        el.load()
      } catch {
      }
      resolve()
    }
    const timer = window.setTimeout(finish, AUDIO_WARM_TIMEOUT_MS)
    el.addEventListener('canplaythrough', finish, { once: true })
    el.addEventListener('canplay', finish, { once: true })
    el.addEventListener('error', finish, { once: true })
    el.addEventListener(
      'loadedmetadata',
      () => {
        try {
          el.currentTime = Math.max(0, seekTo)
        } catch {
        }
      },
      { once: true }
    )
    el.src = url
    el.load()
  })
}

export async function warmNearPlayheadAudioSources(): Promise<void> {
  const { audios, playbackTime } = useManifestStore.getState()
  if (audios.length === 0) return

  const unique = new Map<string, number>()
  for (const audio of audios) {
    if (!isPlaybackFetchableUrl(audio.url)) continue
    if (
      playbackTime < audio.startTime - AUDIO_PREFETCH_BEFORE_SEC ||
      playbackTime >= audio.endTime + AUDIO_KEEP_AFTER_SEC
    ) {
      continue
    }
    if (!unique.has(audio.url)) {
      unique.set(audio.url, Math.max(0, audio.trimStart ?? 0))
    }
  }

  await Promise.all(
    [...unique.entries()].map(([url, seekTo]) => warmAudioUrl(url, seekTo))
  )
}
