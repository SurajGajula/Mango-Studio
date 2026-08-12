import { createScaledVideoProxy, terminateFFmpeg } from '@/app/lib/ffmpegEngine'
import { isPlaybackFetchableUrl } from '@/app/lib/persistedMediaRefs'
import { videoTimelineActiveEnd } from '@/app/lib/adjacentSplitVideo'
import { warmNearPlayheadAudioSources } from '@/app/lib/previewAudioWarmup'
import { videoFullResMediaUrl } from '@/app/lib/videoPlaybackSource'
import type { VideoClass } from '@/app/models/VideoClass'
import { useManifestStore } from '@/app/stores/manifestStore'

const VIDEO_PROXY_MAX_EDGE = 720
const VIDEO_PROXY_PROFILE = `edge-${VIDEO_PROXY_MAX_EDGE}`
const STARTUP_PROXY_LEAD_SEC = 12
const STARTUP_MAX_UNIQUE_SOURCES = 3
const PROXY_DB_NAME = 'mango-preview-proxies'
const PROXY_DB_VERSION = 1
const PROXY_STORE = 'proxies'

const proxyUrlBySource = new Map<string, string>()
const skippedSources = new Set<string>()
const inflightBySource = new Map<string, Promise<string | null>>()
const durableKeyBySource = new Map<string, string>()
let activeProxyProfile: string | null = null

function invalidateProxiesIfProfileChanged() {
  if (activeProxyProfile === VIDEO_PROXY_PROFILE) return
  activeProxyProfile = VIDEO_PROXY_PROFILE
  clearVideoProxyCache()
  const state = useManifestStore.getState()
  const withProxy = state.videos.filter((video) => Boolean(video.proxyUrl))
  if (withProxy.length === 0) return
  state.pauseHistory()
  try {
    for (const video of withProxy) {
      state.updateVideo(video.id, { proxyUrl: undefined })
    }
  } finally {
    state.resumeHistory()
  }
}

function openProxyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROXY_DB_NAME, PROXY_DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROXY_STORE)) {
        db.createObjectStore(PROXY_STORE)
      }
    }
  })
}

function idbGetProxy(key: string): Promise<Blob | undefined> {
  return openProxyDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(PROXY_STORE, 'readonly')
        const r = tx.objectStore(PROXY_STORE).get(key)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => resolve(r.result as Blob | undefined)
        tx.oncomplete = () => db.close()
      })
  )
}

function idbPutProxy(key: string, blob: Blob): Promise<void> {
  return openProxyDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(PROXY_STORE, 'readwrite')
        const r = tx.objectStore(PROXY_STORE).put(blob, key)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => resolve()
        tx.oncomplete = () => db.close()
      })
  )
}

async function fingerprintSourceBlob(blob: Blob): Promise<string> {
  const sampleSize = Math.min(blob.size, 256 * 1024)
  const sample = new Uint8Array(await blob.slice(0, sampleSize).arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', sample)
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
  return `${VIDEO_PROXY_PROFILE}:${blob.size}:${blob.type || 'unknown'}:${hash}`
}

async function durableProxyKeyForSource(sourceUrl: string): Promise<string | null> {
  const cached = durableKeyBySource.get(sourceUrl)
  if (cached) return cached
  try {
    if (sourceUrl.startsWith('blob:')) {
      const blob = await fetch(sourceUrl).then((r) => r.blob())
      if (!blob || blob.size === 0) return null
      const key = await fingerprintSourceBlob(blob)
      durableKeyBySource.set(sourceUrl, key)
      return key
    }
    if (isPlaybackFetchableUrl(sourceUrl)) {
      const key = `${VIDEO_PROXY_PROFILE}:url:${sourceUrl}`
      durableKeyBySource.set(sourceUrl, key)
      return key
    }
  } catch {
    return null
  }
  return null
}

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

async function tryRestoreDurableProxy(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) return null
  const cached = proxyUrlBySource.get(sourceUrl)
  if (cached) return cached
  if (skippedSources.has(sourceUrl)) return null
  if (!isPlaybackFetchableUrl(sourceUrl) && !sourceUrl.startsWith('blob:')) return null

  const durableKey = await durableProxyKeyForSource(sourceUrl)
  if (!durableKey) return null
  try {
    const stored = await idbGetProxy(durableKey)
    if (stored && stored.size > 0) {
      const proxyUrl = URL.createObjectURL(stored)
      proxyUrlBySource.set(sourceUrl, proxyUrl)
      return proxyUrl
    }
  } catch {
  }
  return null
}

async function createProxyObjectUrl(sourceUrl: string): Promise<string | null> {
  if (!isPlaybackFetchableUrl(sourceUrl) && !sourceUrl.startsWith('blob:')) return null
  if (skippedSources.has(sourceUrl)) return null
  const cached = proxyUrlBySource.get(sourceUrl)
  if (cached) return cached

  const restored = await tryRestoreDurableProxy(sourceUrl)
  if (restored) return restored

  try {
    const { width, height } = await probeVideoSize(sourceUrl)
    if (Math.max(width, height) <= VIDEO_PROXY_MAX_EDGE) {
      skippedSources.add(sourceUrl)
      return null
    }
  } catch {
    return null
  }

  const durableKey = await durableProxyKeyForSource(sourceUrl)

  try {
    const blob = await createScaledVideoProxy(sourceUrl, VIDEO_PROXY_MAX_EDGE)
    if (!blob || blob.size === 0) return null
    if (durableKey) {
      try {
        await idbPutProxy(durableKey, blob)
      } catch {
      }
    }
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

function selectCriticalStartupVideos(videos: VideoClass[], playbackTime: number): VideoClass[] {
  if (videos.length === 0) return []
  const windowEnd = playbackTime + STARTUP_PROXY_LEAD_SEC
  const ranked = videos
    .map((video) => {
      const start = video.timestamp
      const end = videoTimelineActiveEnd(video, videos)
      const overlaps = end > playbackTime - 0.25 && start <= windowEnd
      if (!overlaps) return null
      const sourceUrl = videoFullResMediaUrl(video)
      if (!sourceUrl) return null
      const distance = start <= playbackTime && playbackTime < end ? 0 : Math.max(0, start - playbackTime)
      return { video, sourceUrl, distance }
    })
    .filter((entry): entry is { video: VideoClass; sourceUrl: string; distance: number } => entry != null)
    .sort((a, b) => a.distance - b.distance || a.video.timestamp - b.video.timestamp)

  const chosen: VideoClass[] = []
  const seenSources = new Set<string>()
  for (const entry of ranked) {
    if (seenSources.has(entry.sourceUrl)) {
      chosen.push(entry.video)
      continue
    }
    if (seenSources.size >= STARTUP_MAX_UNIQUE_SOURCES) continue
    seenSources.add(entry.sourceUrl)
    chosen.push(entry.video)
  }
  return chosen
}

export async function ensureProxiesForVideos(videos: VideoClass[]) {
  invalidateProxiesIfProfileChanged()
  const latestById = new Map(
    useManifestStore.getState().videos.map((video) => [video.id, video] as const)
  )
  const needed = new Map<string, true>()
  for (const input of videos) {
    const video = latestById.get(input.id) ?? input
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

export async function prepareProjectPreviewStartup(): Promise<void> {
  invalidateProxiesIfProfileChanged()
  const { videos, audios, playbackTime } = useManifestStore.getState()
  if (videos.length === 0 && audios.length === 0) return

  const critical = selectCriticalStartupVideos(videos, playbackTime)
  const criticalSources = [
    ...new Set(
      critical
        .map((video) => videoFullResMediaUrl(video))
        .filter((url): url is string => Boolean(url))
    ),
  ]

  await Promise.all([
    warmNearPlayheadAudioSources(),
    ...criticalSources.map(async (sourceUrl) => {
      const proxyUrl = await tryRestoreDurableProxy(sourceUrl)
      if (proxyUrl) applyProxyToMatchingVideos(sourceUrl, proxyUrl)
    }),
  ])

  if (videos.length > 0) {
    window.setTimeout(() => {
      void ensureProxiesForVideos(videos)
    }, 800)
  }
}

export function clearVideoProxyCache() {
  for (const url of proxyUrlBySource.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  proxyUrlBySource.clear()
  skippedSources.clear()
  inflightBySource.clear()
  durableKeyBySource.clear()
}
