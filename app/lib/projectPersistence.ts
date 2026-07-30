import { useEffect, useRef } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass, coerceAnimationZoomEasing } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass, type EffectType } from '@/app/models/EffectClass'
import type { HistoryEntry } from '@/app/stores/manifest/types'
import { isPersistedBlobTokenRef, PERSISTED_BLOB_TOKEN_PREFIX } from '@/app/lib/persistedMediaRefs'
import { repairSnapshotMediaFromAccountLibrary } from '@/app/lib/repairSnapshotMediaFromLibrary'
import { normalizeVideoAfterSnapshotRevive } from '@/app/lib/videoPlaybackSource'
import { livePlaybackTimeRef } from '@/app/lib/playbackClock'

const DB_VERSION = 1
const STORE_META = 'meta'
const STORE_BLOBS = 'blobs'
const inflightCloudLoadSnapshot = new Map<string, Promise<ProjectSnapshotPayload | null>>()
const lastCloudSnapshotHash = new Map<string, string>()
const inflightCloudSaveSnapshot = new Map<string, Promise<void>>()
const CLOUD_SNAPSHOT_MAX_BYTES = 6 * 1024 * 1024
const CLOUD_SAVE_MAX_ATTEMPTS = 3
const CLOUD_SAVE_RETRY_BASE_MS = 1500

export type ProjectSnapshotPayload = {
  version: 1
  videos: unknown[]
  images: unknown[]
  texts: unknown[]
  audios: unknown[]
  effects: unknown[]
  history?: unknown[]
  historyIndex?: number
  playbackTime?: number
  isPlaying?: boolean
  isLooping?: boolean
  playbackRate?: number
  pendingPrompt?: string | null
}

function userDraftDbName(userId: string): string {
  return `mango-user-local-draft-${userId}`
}

function userSnapshotKey(projectId: string): string {
  return `user-draft:${projectId}`
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

async function replaceBlobUrlsInValue(
  value: unknown,
  mapTokenToBlob: Map<string, Blob>,
  tokenToObjectUrl: Map<string, string>,
  rawBlobUrlOutcome: Map<string, string>
): Promise<unknown> {
  if (typeof value === 'string') {
    if (isPersistedBlobTokenRef(value)) {
      const reused = tokenToObjectUrl.get(value)
      if (reused) return reused
      const blob = mapTokenToBlob.get(value)
      if (blob) {
        const url = URL.createObjectURL(blob)
        tokenToObjectUrl.set(value, url)
        return url
      }
      return ''
    } else if (value.startsWith('blob:')) {
      const memo = rawBlobUrlOutcome.get(value)
      if (memo !== undefined) return memo
      try {
        const res = await fetch(value)
        const blob = await res.blob()
        if (!blob || blob.size === 0) {
          rawBlobUrlOutcome.set(value, '')
          return ''
        }
        rawBlobUrlOutcome.set(value, value)
        return value
      } catch {
        rawBlobUrlOutcome.set(value, '')
        return ''
      }
    }
    return value
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      out.push(await replaceBlobUrlsInValue(item, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome))
    }
    return out
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const k of Object.keys(o)) {
      next[k] = await replaceBlobUrlsInValue(o[k], mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)
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
    const token = `${PERSISTED_BLOB_TOKEN_PREFIX}${blobWrites.size}`
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
    coerceAnimationZoomEasing(o.animationZoomEasing),
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
    o.transitionFlashMode as VideoClass['transitionFlashMode'],
    o.zoomDistanceIntensity as number | undefined,
    o.transitionWipeEasing as VideoClass['transitionWipeEasing'],
    o.flipHorizontal as boolean | undefined,
    o.flipVertical as boolean | undefined,
    o.reversed as boolean | undefined
  )
}

function reviveImage(o: Record<string, unknown>): ImageClass {
  const row = snapshotRow(o)
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
    coerceAnimationZoomEasing(o.animationZoomEasing),
    o.transitionColor as string | undefined,
    o.transitionDirection as ImageClass['transitionDirection'],
    o.transitionAxis as ImageClass['transitionAxis'],
    o.transitionSlideEasing as ImageClass['transitionSlideEasing'],
    o.transitionCircleEasing as ImageClass['transitionCircleEasing'],
    row,
    o.rotation as number | undefined,
    o.keyframes as ImageClass['keyframes'],
    undefined,
    o.transitionFlashMode as ImageClass['transitionFlashMode'],
    o.zoomDistanceIntensity as number | undefined,
    o.transitionWipeEasing as ImageClass['transitionWipeEasing'],
    o.flipHorizontal as boolean | undefined,
    o.flipVertical as boolean | undefined
  )
}

function reviveWordTimings(value: unknown): TextClass['wordTimings'] {
  if (!Array.isArray(value)) return undefined
  const timings = value
    .filter(
      (w) =>
        w &&
        typeof w === 'object' &&
        typeof (w as Record<string, unknown>).text === 'string' &&
        typeof (w as Record<string, unknown>).startTime === 'number' &&
        typeof (w as Record<string, unknown>).endTime === 'number'
    )
    .map((w) => {
      const word = w as Record<string, unknown>
      return {
        text: String(word.text),
        startTime: Number(word.startTime),
        endTime: Number(word.endTime),
      }
    })
  return timings.length > 0 ? timings : undefined
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
    o.row as number | undefined,
    reviveWordTimings(o.wordTimings)
  )
}

function reviveAudio(o: Record<string, unknown>): AudioClass {
  const row = snapshotRow(o)
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
    row,
    o.volume as number | undefined,
    o.pitch as number | undefined,
    o.fadeOutDuration as number | undefined,
    o.speedStart as number | undefined,
    o.speedEnd as number | undefined,
    o.speedEasing as 'linear' | 'ease' | undefined
  )
}

function reviveEffect(o: Record<string, unknown>): EffectClass {
  const flashRaw = o.flashSpeed
  const flashSpeed =
    flashRaw !== undefined && flashRaw !== null && Number.isFinite(Number(flashRaw)) ? Number(flashRaw) : 1
  const rawType = o.type === 'sketch-overlay' ? 'grainy' : o.type
  return new EffectClass(
    String(o.id),
    rawType as EffectType,
    Number(o.startTime),
    Number(o.endTime),
    o.row as number | undefined,
    o.intensity as number | undefined,
    o.contrast !== undefined && o.contrast !== null ? Number(o.contrast) : undefined,
    flashSpeed,
    o.createdAt ? new Date(String(o.createdAt)) : undefined
  )
}

function reviveHistoryEntry(e: Record<string, unknown>): HistoryEntry {
  return {
    videos: Array.isArray(e.videos)
      ? e.videos.map((v) => normalizeVideoAfterSnapshotRevive(reviveVideo(v as Record<string, unknown>)))
      : [],
    images: Array.isArray(e.images) ? e.images.map((i) => reviveImage(i as Record<string, unknown>)) : [],
    texts: Array.isArray(e.texts) ? e.texts.map((t) => reviveText(t as Record<string, unknown>)) : [],
    audios: Array.isArray(e.audios) ? e.audios.map((a) => reviveAudio(a as Record<string, unknown>)) : [],
    effects: Array.isArray(e.effects) ? e.effects.map((x) => reviveEffect(x as Record<string, unknown>)) : [],
  }
}

export function isManifestVisuallyEmpty(): boolean {
  const s = useManifestStore.getState()
  return isSnapshotPayloadVisuallyEmpty({
    version: 1,
    videos: s.videos,
    images: s.images,
    texts: s.texts,
    audios: s.audios,
    effects: s.effects,
  })
}

export function isSnapshotPayloadVisuallyEmpty(snap: ProjectSnapshotPayload): boolean {
  return (
    snap.videos.length === 0 &&
    snap.images.length === 0 &&
    snap.texts.length === 0 &&
    snap.audios.length === 0 &&
    snap.effects.length === 0
  )
}

async function buildProjectSnapshotPayload(): Promise<{
  payload: ProjectSnapshotPayload
  blobWrites: Map<string, Blob>
}> {
  const s = useManifestStore.getState()
  const blobWrites = new Map<string, Blob>()
  const blobUrlToToken = new Map<string, string>()

  const stripProxy = (v: unknown) => {
    if (!v || typeof v !== 'object') return v
    const copy = { ...(v as Record<string, unknown>) }
    delete copy.proxyUrl
    return copy
  }

  const raw = {
    videos: s.videos.map((v) => stripProxy(JSON.parse(JSON.stringify(v)))),
    images: s.images.map((i) => JSON.parse(JSON.stringify(i))),
    texts: s.texts.map((t) => JSON.parse(JSON.stringify(t))),
    audios: s.audios.map((a) => JSON.parse(JSON.stringify(a))),
    effects: s.effects.map((e) => JSON.parse(JSON.stringify(e))),
    history: s.history.map((h) => ({
      videos: h.videos.map((v) => stripProxy(JSON.parse(JSON.stringify(v)))),
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
    pendingPrompt: s.pendingPrompt,
  }

  return { payload, blobWrites }
}

async function saveProjectSnapshot(dbName: string, metaKey: string): Promise<void> {
  const { payload, blobWrites } = await buildProjectSnapshotPayload()

  for (const [token, blob] of blobWrites) {
    await idbPut(dbName, STORE_BLOBS, token, blob)
  }
  await idbPut(dbName, STORE_META, metaKey, JSON.stringify(payload))
}

async function putCloudProjectSnapshot(
  requestBody: string,
  cloudPayloadHash: string,
  projectId: string
): Promise<void> {
  let lastMessage = 'Cloud snapshot save failed'
  for (let attempt = 1; attempt <= CLOUD_SAVE_MAX_ATTEMPTS; attempt++) {
    const res = await fetch('/api/project/snapshot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      credentials: 'include',
    })
    if (res.ok) {
      lastCloudSnapshotHash.set(projectId, cloudPayloadHash)
      return
    }
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null
    lastMessage = errBody?.error ?? res.statusText
    if (!isCloudSnapshotSaveTimeout(lastMessage) || attempt === CLOUD_SAVE_MAX_ATTEMPTS) {
      console.warn('Cloud snapshot save failed:', lastMessage)
      return
    }
    await sleep(CLOUD_SAVE_RETRY_BASE_MS * attempt)
  }
  console.warn('Cloud snapshot save failed:', lastMessage)
}

async function saveCloudProjectSnapshot(payload: ProjectSnapshotPayload, projectId: string): Promise<void> {
  if (snapshotUsesLocalOnlyMediaRefs(payload)) {
    console.warn('Cloud snapshot skipped: timeline still has browser-only blob media refs')
    return
  }
  const requestBody = cloudSnapshotRequestBody(payload, projectId)
  if (requestBody.length > CLOUD_SNAPSHOT_MAX_BYTES) {
    console.warn(
      `Cloud snapshot skipped: payload is ${(requestBody.length / (1024 * 1024)).toFixed(1)}MB (limit ${CLOUD_SNAPSHOT_MAX_BYTES / (1024 * 1024)}MB)`
    )
    return
  }
  const cloudPayloadHash = cloudSnapshotPayloadHash(payload)
  const previousHash = lastCloudSnapshotHash.get(projectId) ?? null
  if (cloudPayloadHash === previousHash) {
    return
  }
  const inflight = inflightCloudSaveSnapshot.get(projectId)
  if (inflight) {
    await inflight
    if (cloudPayloadHash === (lastCloudSnapshotHash.get(projectId) ?? null)) {
      return
    }
  }
  const nextPromise = putCloudProjectSnapshot(requestBody, cloudPayloadHash, projectId).finally(() => {
    inflightCloudSaveSnapshot.delete(projectId)
  })
  inflightCloudSaveSnapshot.set(projectId, nextPromise)
  await nextPromise
}

async function loadCloudProjectSnapshot(projectId: string): Promise<ProjectSnapshotPayload | null> {
  const inflight = inflightCloudLoadSnapshot.get(projectId)
  if (inflight) {
    return inflight
  }
  const nextPromise = fetch(`/api/project/snapshot?projectId=${encodeURIComponent(projectId)}`, { method: 'GET', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return null
      const body = (await res.json().catch(() => null)) as { snapshot?: unknown } | null
      if (!body?.snapshot || typeof body.snapshot !== 'object') return null
      const snapshot = body.snapshot as ProjectSnapshotPayload
      return snapshot.version === 1 ? snapshot : null
    })
    .finally(() => {
      inflightCloudLoadSnapshot.delete(projectId)
    })
  inflightCloudLoadSnapshot.set(projectId, nextPromise)
  return nextPromise
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
    if (typeof v === 'string' && isPersistedBlobTokenRef(v)) tokens.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v as object).forEach(walk)
  }
  walk(snap)
  return tokens
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isCloudSnapshotSaveTimeout(message: string): boolean {
  return /statement timeout|57014|canceling statement/i.test(message)
}

function cloudSnapshotRequestBody(payload: ProjectSnapshotPayload, projectId: string): string {
  const cloudPayload = {
    version: 1 as const,
    videos: payload.videos,
    images: payload.images,
    texts: payload.texts,
    audios: payload.audios,
    effects: payload.effects,
  }
  return JSON.stringify({ projectId, snapshot: cloudPayload })
}

function cloudSnapshotPayloadHash(payload: ProjectSnapshotPayload): string {
  const cloudPayload = {
    version: 1 as const,
    videos: payload.videos,
    images: payload.images,
    texts: payload.texts,
    audios: payload.audios,
    effects: payload.effects,
  }
  return JSON.stringify(cloudPayload)
}

export function snapshotUsesLocalOnlyMediaRefs(payload: ProjectSnapshotPayload): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === 'string') {
      return isPersistedBlobTokenRef(v) || v.startsWith('blob:')
    }
    if (Array.isArray(v)) return v.some(walk)
    if (v && typeof v === 'object') return Object.values(v as object).some(walk)
    return false
  }
  return walk({
    videos: payload.videos,
    images: payload.images,
    texts: payload.texts,
    audios: payload.audios,
    effects: payload.effects,
  })
}

async function hydrateSnapshotIntoStore(
  snap: ProjectSnapshotPayload,
  dbName: string,
  repairFromAccountLibrary: boolean
): Promise<boolean> {
  const tokens = collectBlobTokens(snap)
  const mapTokenToBlob = new Map<string, Blob>()
  for (const token of tokens) {
    const blob = await idbGet<Blob>(dbName, STORE_BLOBS, token)
    if (blob) mapTokenToBlob.set(token, blob)
  }

  const tokenToObjectUrl = new Map<string, string>()
  const rawBlobUrlOutcome = new Map<string, string>()
  const videos = (await replaceBlobUrlsInValue(snap.videos, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[]
  const images = (await replaceBlobUrlsInValue(snap.images, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[]
  const texts = (await replaceBlobUrlsInValue(snap.texts, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[]
  const audios = (await replaceBlobUrlsInValue(snap.audios, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[]
  const effects = (await replaceBlobUrlsInValue(snap.effects, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[]
  const historyRaw = Array.isArray(snap.history)
    ? ((await replaceBlobUrlsInValue(snap.history, mapTokenToBlob, tokenToObjectUrl, rawBlobUrlOutcome)) as unknown[])
    : []

  const revivedVideos = videos.map((v) =>
    normalizeVideoAfterSnapshotRevive(reviveVideo(v as Record<string, unknown>))
  )
  const revivedImages = images.map((i) => reviveImage(i as Record<string, unknown>))
  const revivedTexts = texts.map((t) => reviveText(t as Record<string, unknown>))
  const revivedAudios = audios.map((a) => reviveAudio(a as Record<string, unknown>))
  const revivedEffects = effects.map((e) => reviveEffect(e as Record<string, unknown>))
  const revivedHistory = historyRaw.map((h) => reviveHistoryEntry(h as Record<string, unknown>))

  let historyIndex = typeof snap.historyIndex === 'number' ? snap.historyIndex : 0
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

  const playbackTime = typeof snap.playbackTime === 'number' ? snap.playbackTime : 0
  livePlaybackTimeRef.current = playbackTime
  useManifestStore.setState({
    videos: revivedVideos,
    images: revivedImages,
    texts: revivedTexts,
    audios: revivedAudios,
    effects: revivedEffects,
    history: revivedHistory,
    historyIndex,
    playbackTime,
    isPlaying: false,
    isLooping: snap.isLooping ?? false,
    playbackRate: typeof snap.playbackRate === 'number' ? snap.playbackRate : 1,
    pendingPrompt: snap.pendingPrompt ?? null,
  })

  if (!repairFromAccountLibrary) return false
  return repairSnapshotMediaFromAccountLibrary()
}

export async function saveUserDraftSnapshot(userId: string, projectId: string): Promise<void> {
  const { payload, blobWrites } = await buildProjectSnapshotPayload()
  for (const [token, blob] of blobWrites) {
    await idbPut(userDraftDbName(userId), STORE_BLOBS, token, blob)
  }
  const snapshotKey = userSnapshotKey(projectId)
  await idbPut(userDraftDbName(userId), STORE_META, snapshotKey, JSON.stringify(payload))
}

async function saveUserDraftCloudSnapshot(userId: string, projectId: string): Promise<void> {
  const snapshotKey = userSnapshotKey(projectId)
  const raw = await idbGet<string>(userDraftDbName(userId), STORE_META, snapshotKey)
  if (!raw) return
  let payload: ProjectSnapshotPayload
  try {
    payload = JSON.parse(raw) as ProjectSnapshotPayload
  } catch {
    return
  }
  if (payload.version !== 1) return
  await saveCloudProjectSnapshot(payload, projectId)
}

export async function hydrateLocalProjectIfNeeded(user: { id: string }, projectId: string): Promise<void> {
  if (!isManifestVisuallyEmpty()) return

  const dbName = userDraftDbName(user.id)
  const userSnap = await loadProjectSnapshot(dbName, userSnapshotKey(projectId))
  if (userSnap && userSnap.version === 1 && !isSnapshotPayloadVisuallyEmpty(userSnap)) {
    const repaired = await hydrateSnapshotIntoStore(userSnap, dbName, true)
    if (repaired) {
      await saveUserDraftSnapshot(user.id, projectId)
      await saveUserDraftCloudSnapshot(user.id, projectId)
    }
    return
  }
  const cloudSnap = await loadCloudProjectSnapshot(projectId)
  if (cloudSnap && cloudSnap.version === 1 && !isSnapshotPayloadVisuallyEmpty(cloudSnap)) {
    const repaired = await hydrateSnapshotIntoStore(cloudSnap, dbName, true)
    if (repaired) {
      await saveUserDraftSnapshot(user.id, projectId)
      await saveUserDraftCloudSnapshot(user.id, projectId)
    }
  }
}

export function useUserProjectPersistence(user: { id: string } | null, projectId: string | null) {
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || !projectId) return

    const manifestChanged = (
      state: ReturnType<typeof useManifestStore.getState>,
      prevState: ReturnType<typeof useManifestStore.getState>
    ) =>
      state.videos !== prevState.videos ||
      state.images !== prevState.images ||
      state.texts !== prevState.texts ||
      state.audios !== prevState.audios ||
      state.effects !== prevState.effects ||
      state.history !== prevState.history ||
      state.historyIndex !== prevState.historyIndex ||
      state.playbackTime !== prevState.playbackTime ||
      state.isLooping !== prevState.isLooping ||
      state.playbackRate !== prevState.playbackRate ||
      state.pendingPrompt !== prevState.pendingPrompt

    const scheduleLocal = () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current)
      localTimerRef.current = setTimeout(() => {
        localTimerRef.current = null
        void saveUserDraftSnapshot(userId, projectId).catch(() => {})
      }, 500)
    }

    const scheduleCloud = () => {
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current)
      cloudTimerRef.current = setTimeout(() => {
        cloudTimerRef.current = null
        void saveUserDraftCloudSnapshot(userId, projectId).catch(() => {})
      }, 2500)
    }

    const schedule = () => {
      scheduleLocal()
      scheduleCloud()
    }

    const unsub = useManifestStore.subscribe((state, prevState) => {
      if (!manifestChanged(state, prevState)) return
      schedule()
    })
    const onHide = () => {
      void saveUserDraftSnapshot(userId, projectId)
        .then(() => saveUserDraftCloudSnapshot(userId, projectId))
        .catch(() => {})
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)

    return () => {
      unsub()
      if (localTimerRef.current) clearTimeout(localTimerRef.current)
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [projectId, userId])
}
