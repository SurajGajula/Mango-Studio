import { useEffect, useRef } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass, type EffectType } from '@/app/models/EffectClass'
import type { AspectRatio, HistoryEntry } from '@/app/stores/manifest/types'

const DB_NAME_GUEST = 'mango-guest-project'
const DB_VERSION = 1
const STORE_META = 'meta'
const STORE_BLOBS = 'blobs'
const SNAPSHOT_KEY_GUEST = 'guest-snapshot'
const SNAPSHOT_KEY_USER = 'user-draft'

const BLOB_TOKEN_PREFIX = '__GUESTPERSIST_BLOB:'

export const PROJECT_PERSISTENCE_NOTE =
  'Video and audio binary data are not stored in localStorage (quota ~5MB, synchronous). This app uses IndexedDB for local project snapshots (guest and signed-in drafts).'

export type ProjectSnapshotPayload = {
  version: 1
  videos: unknown[]
  images: unknown[]
  texts: unknown[]
  audios: unknown[]
  effects: unknown[]
  history: unknown[]
  historyIndex: number
  playbackTime: number
  isPlaying: boolean
  isLooping: boolean
  playbackRate: number
  aspectRatio: string
  pendingPrompt: string | null
}

function userDraftDbName(userId: string): string {
  return `mango-user-local-draft-${userId}`
}

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META)
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS)
      }
    }
  })
}

function idbGet<T>(dbName: string, store: string, key: string): Promise<T | undefined> {
  return openDb(dbName).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const os = tx.objectStore(store)
        const r = os.get(key)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => resolve(r.result as T | undefined)
        tx.oncomplete = () => db.close()
      })
  )
}

function idbPut(dbName: string, store: string, key: string, value: unknown): Promise<void> {
  return openDb(dbName).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const os = tx.objectStore(store)
        const r = os.put(value, key)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => resolve()
        tx.oncomplete = () => db.close()
      })
  )
}

function idbDeleteDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

async function replaceBlobUrlsInValue(
  value: unknown,
  mapTokenToBlob: Map<string, Blob>,
  tokenToObjectUrl: Map<string, string>
): Promise<unknown> {
  if (typeof value === 'string') {
    if (value.startsWith(BLOB_TOKEN_PREFIX)) {
      const reused = tokenToObjectUrl.get(value)
      if (reused) return reused
      const blob = mapTokenToBlob.get(value)
      if (blob) {
        const url = URL.createObjectURL(blob)
        tokenToObjectUrl.set(value, url)
        return url
      }
    }
    return value
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      out.push(await replaceBlobUrlsInValue(item, mapTokenToBlob, tokenToObjectUrl))
    }
    return out
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const k of Object.keys(o)) {
      next[k] = await replaceBlobUrlsInValue(o[k], mapTokenToBlob, tokenToObjectUrl)
    }
    return next
  }
  return value
}

async function tokenizeBlobUrls(
  value: unknown,
  blobWrites: Map<string, Blob>,
  blobUrlToToken: Map<string, string>
): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith('blob:')) {
    const mapped = blobUrlToToken.get(value)
    if (mapped) return mapped
    const token = `${BLOB_TOKEN_PREFIX}${blobWrites.size}`
    try {
      const res = await fetch(value)
      const blob = await res.blob()
      blobWrites.set(token, blob)
      blobUrlToToken.set(value, token)
    } catch {
      return value
    }
    return token
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      out.push(await tokenizeBlobUrls(item, blobWrites, blobUrlToToken))
    }
    return out
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const k of Object.keys(o)) {
      next[k] = await tokenizeBlobUrls(o[k], blobWrites, blobUrlToToken)
    }
    return next
  }
  return value
}

function snapshotRow(o: Record<string, unknown>): number {
  const r = o.row
  if (typeof r === 'number' && Number.isFinite(r)) return r
  return 0
}

function reviveVideo(o: Record<string, unknown>): VideoClass {
  const row = snapshotRow(o)
  const isOverlay = row !== 0
  return new VideoClass(
    String(o.id),
    String(o.title),
    o.url as string | undefined,
    o.duration as number | undefined,
    o.timestamp as number | undefined,
    o.createdAt ? new Date(String(o.createdAt)) : undefined,
    o.updatedAt ? new Date(String(o.updatedAt)) : undefined,
    o.originalDuration as number | undefined,
    o.trimStart as number | undefined,
    o.trimEnd as number | undefined,
    o.prompt as string | undefined,
    isOverlay,
    o.x as number | undefined,
    o.y as number | undefined,
    o.width as number | undefined,
    o.height as number | undefined,
    o.opacity as number | undefined,
    o.animation as VideoClass['animation'],
    o.transition as VideoClass['transition'],
    o.zoomIntensity as number | undefined,
    o.transitionDuration as number | undefined,
    o.animationDuration as number | undefined,
    o.transitionColor as string | undefined,
    o.transitionDirection as VideoClass['transitionDirection'],
    o.transitionAxis as VideoClass['transitionAxis'],
    o.transitionSlideEasing as VideoClass['transitionSlideEasing'],
    o.transitionCircleEasing as VideoClass['transitionCircleEasing'],
    row,
    o.muted as boolean | undefined,
    o.cropAspect as string | undefined,
    o.cropSx as number | undefined,
    o.cropSy as number | undefined,
    o.cropSw as number | undefined,
    o.cropSh as number | undefined,
    o.sourceUrl as string | undefined,
    o.sourceTrimStart as number | undefined,
    o.sourceDuration as number | undefined,
    o.playbackSpeed as number | undefined,
    o.speedStart as number | undefined,
    o.speedEnd as number | undefined,
    o.speedEasing as 'linear' | 'ease' | undefined,
    o.keyframes as VideoClass['keyframes'],
    undefined,
    o.transitionFlashMode as VideoClass['transitionFlashMode']
  )
}

function reviveImage(o: Record<string, unknown>): ImageClass {
  const row = snapshotRow(o)
  const isMainTrack = row === 0
  return new ImageClass(
    String(o.id),
    String(o.name),
    String(o.url),
    Number(o.startTime),
    Number(o.endTime),
    o.x as number | undefined,
    o.y as number | undefined,
    o.width as number | undefined,
    o.height as number | undefined,
    o.opacity as number | undefined,
    o.createdAt ? new Date(String(o.createdAt)) : undefined,
    isMainTrack,
    o.animation as ImageClass['animation'],
    o.transition as ImageClass['transition'],
    o.cropAspect as string | undefined,
    o.cropSx as number | undefined,
    o.cropSy as number | undefined,
    o.cropSw as number | undefined,
    o.cropSh as number | undefined,
    o.zoomIntensity as number | undefined,
    o.transitionDuration as number | undefined,
    o.animationDuration as number | undefined,
    o.transitionColor as string | undefined,
    o.transitionDirection as ImageClass['transitionDirection'],
    o.transitionAxis as ImageClass['transitionAxis'],
    o.transitionSlideEasing as ImageClass['transitionSlideEasing'],
    o.transitionCircleEasing as ImageClass['transitionCircleEasing'],
    row,
    o.rotation as number | undefined,
    o.keyframes as ImageClass['keyframes'],
    undefined,
    o.transitionFlashMode as ImageClass['transitionFlashMode']
  )
}

function reviveText(o: Record<string, unknown>): TextClass {
  return new TextClass(
    String(o.id),
    String(o.content),
    Number(o.startTime),
    Number(o.endTime),
    o.x as number | undefined,
    o.y as number | undefined,
    o.width as number | undefined,
    o.height as number | undefined,
    o.opacity as number | undefined,
    o.fontSize as number | undefined,
    o.fontFamily as string | undefined,
    o.color as string | undefined,
    o.fontWeight as string | undefined,
    o.textAlign as string | undefined,
    o.animation as TextClass['animation'],
    o.style as TextClass['style'],
    o.createdAt ? new Date(String(o.createdAt)) : undefined,
    o.row as number | undefined
  )
}

function reviveAudio(o: Record<string, unknown>): AudioClass {
  const row = snapshotRow(o)
  const isOverlay = row >= 1
  return new AudioClass(
    String(o.id),
    String(o.name),
    String(o.url),
    Number(o.startTime),
    Number(o.endTime),
    o.marks as AudioClass['marks'],
    o.createdAt ? new Date(String(o.createdAt)) : undefined,
    o.trimStart as number | undefined,
    o.trimEnd as number | undefined,
    o.originalDuration as number | undefined,
    o.playbackSpeed as number | undefined,
    isOverlay,
    row,
    o.volume as number | undefined,
    o.pitch as number | undefined,
    o.speedStart as number | undefined,
    o.speedEnd as number | undefined,
    o.speedEasing as 'linear' | 'ease' | undefined
  )
}

function reviveEffect(o: Record<string, unknown>): EffectClass {
  return new EffectClass(
    String(o.id),
    o.type as EffectType,
    Number(o.startTime),
    Number(o.endTime),
    o.row as number | undefined,
    o.intensity as number | undefined,
    o.contrast !== undefined && o.contrast !== null ? Number(o.contrast) : undefined,
    o.createdAt ? new Date(String(o.createdAt)) : undefined
  )
}

function reviveHistoryEntry(e: Record<string, unknown>): HistoryEntry {
  return {
    videos: Array.isArray(e.videos) ? e.videos.map((v) => reviveVideo(v as Record<string, unknown>)) : [],
    images: Array.isArray(e.images) ? e.images.map((i) => reviveImage(i as Record<string, unknown>)) : [],
    texts: Array.isArray(e.texts) ? e.texts.map((t) => reviveText(t as Record<string, unknown>)) : [],
    audios: Array.isArray(e.audios) ? e.audios.map((a) => reviveAudio(a as Record<string, unknown>)) : [],
    effects: Array.isArray(e.effects) ? e.effects.map((x) => reviveEffect(x as Record<string, unknown>)) : [],
  }
}

export function isManifestVisuallyEmpty(): boolean {
  const s = useManifestStore.getState()
  return (
    s.videos.length === 0 &&
    s.images.length === 0 &&
    s.texts.length === 0 &&
    s.audios.length === 0 &&
    s.effects.length === 0
  )
}

async function saveProjectSnapshot(dbName: string, metaKey: string): Promise<void> {
  const s = useManifestStore.getState()
  const blobWrites = new Map<string, Blob>()
  const blobUrlToToken = new Map<string, string>()

  const raw = {
    videos: s.videos.map((v) => JSON.parse(JSON.stringify(v))),
    images: s.images.map((i) => JSON.parse(JSON.stringify(i))),
    texts: s.texts.map((t) => JSON.parse(JSON.stringify(t))),
    audios: s.audios.map((a) => JSON.parse(JSON.stringify(a))),
    effects: s.effects.map((e) => JSON.parse(JSON.stringify(e))),
    history: s.history.map((h) => ({
      videos: h.videos.map((v) => JSON.parse(JSON.stringify(v))),
      images: h.images.map((i) => JSON.parse(JSON.stringify(i))),
      texts: h.texts.map((t) => JSON.parse(JSON.stringify(t))),
      audios: h.audios.map((a) => JSON.parse(JSON.stringify(a))),
      effects: h.effects.map((e) => JSON.parse(JSON.stringify(e))),
    })),
  }

  const payload: ProjectSnapshotPayload = {
    version: 1,
    videos: (await tokenizeBlobUrls(raw.videos, blobWrites, blobUrlToToken)) as unknown[],
    images: (await tokenizeBlobUrls(raw.images, blobWrites, blobUrlToToken)) as unknown[],
    texts: (await tokenizeBlobUrls(raw.texts, blobWrites, blobUrlToToken)) as unknown[],
    audios: (await tokenizeBlobUrls(raw.audios, blobWrites, blobUrlToToken)) as unknown[],
    effects: (await tokenizeBlobUrls(raw.effects, blobWrites, blobUrlToToken)) as unknown[],
    history: (await tokenizeBlobUrls(raw.history, blobWrites, blobUrlToToken)) as unknown[],
    historyIndex: s.historyIndex,
    playbackTime: s.playbackTime,
    isPlaying: false,
    isLooping: s.isLooping,
    playbackRate: s.playbackRate,
    aspectRatio: s.aspectRatio,
    pendingPrompt: s.pendingPrompt,
  }

  for (const [token, blob] of blobWrites) {
    await idbPut(dbName, STORE_BLOBS, token, blob)
  }
  await idbPut(dbName, STORE_META, metaKey, JSON.stringify(payload))
}

async function loadProjectSnapshot(dbName: string, metaKey: string): Promise<ProjectSnapshotPayload | null> {
  const raw = await idbGet<string>(dbName, STORE_META, metaKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ProjectSnapshotPayload
  } catch {
    return null
  }
}

function collectBlobTokens(snap: ProjectSnapshotPayload): Set<string> {
  const tokens = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'string' && v.startsWith(BLOB_TOKEN_PREFIX)) tokens.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v as object).forEach(walk)
  }
  walk(snap)
  return tokens
}

async function hydrateSnapshotIntoStore(snap: ProjectSnapshotPayload, dbName: string): Promise<void> {
  const tokens = collectBlobTokens(snap)
  const mapTokenToBlob = new Map<string, Blob>()
  for (const token of tokens) {
    const blob = await idbGet<Blob>(dbName, STORE_BLOBS, token)
    if (blob) mapTokenToBlob.set(token, blob)
  }

  const tokenToObjectUrl = new Map<string, string>()
  const videos = (await replaceBlobUrlsInValue(snap.videos, mapTokenToBlob, tokenToObjectUrl)) as unknown[]
  const images = (await replaceBlobUrlsInValue(snap.images, mapTokenToBlob, tokenToObjectUrl)) as unknown[]
  const texts = (await replaceBlobUrlsInValue(snap.texts, mapTokenToBlob, tokenToObjectUrl)) as unknown[]
  const audios = (await replaceBlobUrlsInValue(snap.audios, mapTokenToBlob, tokenToObjectUrl)) as unknown[]
  const effects = (await replaceBlobUrlsInValue(snap.effects, mapTokenToBlob, tokenToObjectUrl)) as unknown[]
  const historyRaw = (await replaceBlobUrlsInValue(snap.history, mapTokenToBlob, tokenToObjectUrl)) as unknown[]

  const revivedVideos = videos.map((v) => reviveVideo(v as Record<string, unknown>))
  const revivedImages = images.map((i) => reviveImage(i as Record<string, unknown>))
  const revivedTexts = texts.map((t) => reviveText(t as Record<string, unknown>))
  const revivedAudios = audios.map((a) => reviveAudio(a as Record<string, unknown>))
  const revivedEffects = effects.map((e) => reviveEffect(e as Record<string, unknown>))
  const revivedHistory = historyRaw.map((h) => reviveHistoryEntry(h as Record<string, unknown>))

  let historyIndex = snap.historyIndex
  if (revivedHistory.length === 0) {
    revivedHistory.push({
      videos: revivedVideos,
      images: revivedImages,
      texts: revivedTexts,
      audios: revivedAudios,
      effects: revivedEffects,
    })
    historyIndex = 0
  } else if (historyIndex >= revivedHistory.length) {
    historyIndex = revivedHistory.length - 1
  }

  useManifestStore.setState({
    videos: revivedVideos,
    images: revivedImages,
    texts: revivedTexts,
    audios: revivedAudios,
    effects: revivedEffects,
    history: revivedHistory,
    historyIndex,
    playbackTime: snap.playbackTime,
    isPlaying: false,
    isLooping: snap.isLooping ?? false,
    playbackRate: snap.playbackRate,
    aspectRatio: (snap.aspectRatio as AspectRatio) ?? '9:16',
    pendingPrompt: snap.pendingPrompt,
  })

  const mainAudio = revivedAudios.find((a) => !a.isOverlay)
  if (mainAudio) {
    useAudioStore.getState().setAudio(mainAudio)
  } else {
    useAudioStore.getState().removeAudio()
  }
}

export async function saveGuestProjectSnapshot(): Promise<void> {
  await saveProjectSnapshot(DB_NAME_GUEST, SNAPSHOT_KEY_GUEST)
}

export async function saveUserDraftSnapshot(userId: string): Promise<void> {
  await saveProjectSnapshot(userDraftDbName(userId), SNAPSHOT_KEY_USER)
}

export async function loadGuestProjectSnapshot(): Promise<ProjectSnapshotPayload | null> {
  return loadProjectSnapshot(DB_NAME_GUEST, SNAPSHOT_KEY_GUEST)
}

export async function clearGuestProjectPersistence(): Promise<void> {
  await idbDeleteDatabase(DB_NAME_GUEST)
}

export async function clearUserDraftPersistence(userId: string): Promise<void> {
  await idbDeleteDatabase(userDraftDbName(userId))
}

export async function hydrateLocalProjectIfNeeded(user: { id: string } | null): Promise<void> {
  if (user && !isManifestVisuallyEmpty()) {
    await clearGuestProjectPersistence()
    return
  }

  if (!isManifestVisuallyEmpty()) return

  if (user) {
    const userSnap = await loadProjectSnapshot(userDraftDbName(user.id), SNAPSHOT_KEY_USER)
    if (userSnap && userSnap.version === 1) {
      await hydrateSnapshotIntoStore(userSnap, userDraftDbName(user.id))
      return
    }
  }

  const snap = await loadProjectSnapshot(DB_NAME_GUEST, SNAPSHOT_KEY_GUEST)
  if (!snap || snap.version !== 1) return

  await hydrateSnapshotIntoStore(snap, DB_NAME_GUEST)

  if (user) {
    await clearGuestProjectPersistence()
  }
}

export function useGuestProjectPersistence(isGuest: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isGuest) return

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void saveGuestProjectSnapshot().catch(() => {})
      }, 500)
    }

    const unsub = useManifestStore.subscribe(schedule)
    const onHide = () => {
      void saveGuestProjectSnapshot().catch(() => {})
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [isGuest])
}

export function useUserProjectPersistence(user: { id: string } | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) return

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void saveUserDraftSnapshot(userId).catch(() => {})
      }, 500)
    }

    const unsub = useManifestStore.subscribe(schedule)
    const onHide = () => {
      void saveUserDraftSnapshot(userId).catch(() => {})
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [userId])
}
