import { createScaledVideoProxy, terminateFFmpeg } from '@/app/lib/ffmpegEngine'
import { isPlaybackFetchableUrl } from '@/app/lib/persistedMediaRefs'
import { videoFullResMediaUrl } from '@/app/lib/videoPlaybackSource'
import type { VideoClass } from '@/app/models/VideoClass'
import { useManifestStore } from '@/app/stores/manifestStore'

const VIDEO_PROXY_MAX_EDGE = 480

const proxyUrlBySource = new Map<string, string>()
const skippedSources = new Set<string>()
const inflightBySource = new Map<string, Promise<string | null>>()

function probeVideoSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const onDone = () => {
      video.removeAttribute('src')
      video.load()
    }
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      onDone()
      resolve({ width, height })
    }
    video.onerror = () => {
      onDone()
      reject(new Error('Failed to probe video'))
    }
    video.src = url
  })
}

async function createProxyObjectUrl(sourceUrl: string): Promise<string | null> {
  if (!isPlaybackFetchableUrl(sourceUrl) && !sourceUrl.startsWith('blob:')) return null
  if (skippedSources.has(sourceUrl)) return null
  const cached = proxyUrlBySource.get(sourceUrl)
  if (cached) return cached

  try {
    const { width, height } = await probeVideoSize(sourceUrl)
    if (Math.max(width, height) <= VIDEO_PROXY_MAX_EDGE) {
      skippedSources.add(sourceUrl)
      return null
    }
  } catch {
    return null
  }

  try {
    const blob = await createScaledVideoProxy(sourceUrl, VIDEO_PROXY_MAX_EDGE)
    if (!blob || blob.size === 0) return null
    const proxyUrl = URL.createObjectURL(blob)
    proxyUrlBySource.set(sourceUrl, proxyUrl)
    return proxyUrl
  } catch (error) {
    console.error('Failed to create video proxy', sourceUrl, error)
    skippedSources.add(sourceUrl)
    return null
  } finally {
    terminateFFmpeg()
  }
}

function ensureVideoProxyUrl(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) return Promise.resolve(null)
  const cached = proxyUrlBySource.get(sourceUrl)
  if (cached) return Promise.resolve(cached)
  if (skippedSources.has(sourceUrl)) return Promise.resolve(null)
  const inflight = inflightBySource.get(sourceUrl)
  if (inflight) return inflight
  const pending = createProxyObjectUrl(sourceUrl).finally(() => {
    inflightBySource.delete(sourceUrl)
  })
  inflightBySource.set(sourceUrl, pending)
  return pending
}

function applyProxyToMatchingVideos(sourceUrl: string, proxyUrl: string) {
  const state = useManifestStore.getState()
  const matches = state.videos.filter((video) => videoFullResMediaUrl(video) === sourceUrl)
  if (matches.length === 0) return
  state.pauseHistory()
  try {
    for (const video of matches) {
      if (video.proxyUrl === proxyUrl) continue
      state.updateVideo(video.id, { proxyUrl })
    }
  } finally {
    state.resumeHistory()
  }
}

export async function ensureProxiesForVideos(videos: VideoClass[]) {
  const needed = new Map<string, true>()
  for (const video of videos) {
    if (video.proxyUrl && (video.proxyUrl.startsWith('blob:') || isPlaybackFetchableUrl(video.proxyUrl))) {
      continue
    }
    const sourceUrl = videoFullResMediaUrl(video)
    if (!sourceUrl) continue
    const cached = proxyUrlBySource.get(sourceUrl)
    if (cached) {
      applyProxyToMatchingVideos(sourceUrl, cached)
      continue
    }
    if (skippedSources.has(sourceUrl)) continue
    needed.set(sourceUrl, true)
  }

  for (const sourceUrl of needed.keys()) {
    const proxyUrl = await ensureVideoProxyUrl(sourceUrl)
    if (proxyUrl) applyProxyToMatchingVideos(sourceUrl, proxyUrl)
  }
}

export function clearVideoProxyCache() {
  for (const url of proxyUrlBySource.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  proxyUrlBySource.clear()
  skippedSources.clear()
  inflightBySource.clear()
}
