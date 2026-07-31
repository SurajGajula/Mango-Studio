import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { fetchFile } from '@ffmpeg/util'
import { drawTextOverlay, preloadTextFonts } from '@/app/lib/drawTextOverlay'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { runWithPlacementRotation } from '@/app/lib/placementRotation'
import { applyActiveEffects } from '@/app/lib/applyEffect'
import {
  acquireFfmpegLock,
  getFFmpeg,
  releaseFfmpegLock,
  terminateFFmpeg,
  withFfmpegLock,
} from '@/app/lib/ffmpegEngine'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import {
  getSortedRowItems,
  findActiveAndNextItems,
  checkTransition,
  calculateAnimationProgress,
  clipTimelineSpanForSourceMap,
  videoTimelineSourceMapping,
  renderClipTransitionPair,
} from '@/app/lib/renderUtils'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { alignTimeToFrame, calculateTotalDuration, manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import {
  isImageActiveAtTimelineTime,
  isVideoActiveAtTimelineTime,
  videoElapsedForMapping,
} from '@/app/lib/adjacentSplitVideo'
import { rowClipElapsedAtTime } from '@/app/lib/timelineClipAdjacency'
import { videoExportMediaUrl, videoSourceTrimBase } from '@/app/lib/videoPlaybackSource'
import { audioBufferToWav } from '@/app/lib/audioUtils'

export { terminateFFmpeg } from '@/app/lib/ffmpegEngine'

const EXPORT_MAX_ACTIVE_VIDEOS = 3
const EXPORT_VIDEO_PREFETCH_SEC = 2

function videoElementHasDrawableFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= 1
}

function videoElementHasDecodedFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

function releaseExportVideoElement(id: string, videoElements: Map<string, HTMLVideoElement>) {
  const video = videoElements.get(id)
  videoElements.delete(id)
  if (!video) return
  for (const el of videoElements.values()) {
    if (el === video) return
  }
  video.pause()
  video.src = ''
  video.load()
}

function loadExportVideoElement(clip: VideoClass): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.playsInline = true
    video.muted = true
    const clipSrc = videoExportMediaUrl(clip)
    if (clipSrc) setVideoCrossOriginForUrl(video, clipSrc)
    video.src = clipSrc
    video.onloadeddata = () => resolve(video)
    video.onerror = () => reject(new Error(`Failed to load video: ${clip.title}`))
    video.load()
  })
}

function exportVideoDistance(clip: VideoClass, t: number, allVideos: VideoClass[]): number {
  const start = clip.timestamp
  const end = start + manifestVideoTimelineSpanSeconds(clip)
  if (t >= start && t < end) return 0
  if (t < start) return start - t
  return t - end
}

function collectNeededExportVideoIds(
  t: number,
  allVideos: VideoClass[],
  images: ImageClass[] | undefined
): Set<string> {
  const needed = new Set<string>()
  for (const v of allVideos) {
    if (isVideoActiveAtTimelineTime(v, allVideos, t, images)) {
      needed.add(v.id)
      continue
    }
    if (t < v.timestamp && v.timestamp - t <= EXPORT_VIDEO_PREFETCH_SEC) {
      needed.add(v.id)
    }
  }

  const overlayRowIds = new Set<number>()
  for (const v of allVideos) {
    if (v.row >= 0) overlayRowIds.add(v.row)
  }
  for (const img of images || []) {
    if (img.row >= 0) overlayRowIds.add(img.row)
  }
  for (const row of overlayRowIds) {
    const sortedR = getSortedRowItems(row, allVideos, images || [])
    const pr = findActiveAndNextItems(sortedR, t, allVideos)
    const tr = checkTransition(pr.activeItem, pr.nextItem, t)
    if (!tr.transitionActive || !pr.activeItem || !pr.nextItem) continue
    if (pr.activeItem.type === 'video') needed.add(pr.activeItem.item.id)
    if (pr.nextItem.type === 'video') needed.add(pr.nextItem.item.id)
  }

  return needed
}

async function syncExportVideoPool(
  t: number,
  allVideos: VideoClass[],
  images: ImageClass[] | undefined,
  videoElements: Map<string, HTMLVideoElement>
): Promise<void> {
  const neededIds = collectNeededExportVideoIds(t, allVideos, images)
  const neededClips = [...neededIds]
    .map((id) => allVideos.find((v) => v.id === id))
    .filter((v): v is VideoClass => !!v)

  const byUrl = new Map<string, VideoClass[]>()
  for (const clip of neededClips) {
    const url = videoExportMediaUrl(clip) || clip.id
    const list = byUrl.get(url) || []
    list.push(clip)
    byUrl.set(url, list)
  }

  let urlEntries = [...byUrl.entries()].map(([url, clips]) => {
    const primary =
      clips.find((c) => isVideoActiveAtTimelineTime(c, allVideos, t, images)) ||
      clips.reduce((best, clip) =>
        exportVideoDistance(clip, t, allVideos) < exportVideoDistance(best, t, allVideos) ? clip : best
      )
    return {
      url,
      clips,
      primary,
      dist: exportVideoDistance(primary, t, allVideos),
    }
  })
  urlEntries.sort((a, b) => a.dist - b.dist)
  if (urlEntries.length > EXPORT_MAX_ACTIVE_VIDEOS) {
    urlEntries = urlEntries.slice(0, EXPORT_MAX_ACTIVE_VIDEOS)
  }
  const keepUrls = new Set(urlEntries.map((e) => e.url))
  const keepClipIds = new Set(urlEntries.flatMap((e) => e.clips.map((c) => c.id)))

  for (const id of [...videoElements.keys()]) {
    if (!keepClipIds.has(id)) releaseExportVideoElement(id, videoElements)
  }

  await Promise.all(
    urlEntries.map(async ({ url, clips, primary }) => {
      const sorted = [...clips].sort((a, b) => a.timestamp - b.timestamp)
      const separateIds = new Set<string>()
      for (let i = 1; i < sorted.length; i++) {
        const earlier = sorted[i - 1]
        const later = sorted[i]
        if ((later.transition ?? 'none') === 'none') continue
        const earlierEnd = earlier.timestamp + (earlier.duration ?? 0)
        const gap = later.timestamp - earlierEnd
        if (gap >= -1e-6 && gap < 3 / 60) {
          separateIds.add(earlier.id)
          separateIds.add(later.id)
        }
      }

      let shared: HTMLVideoElement | undefined
      const sharedClips = clips.filter((clip) => !separateIds.has(clip.id))
      if (sharedClips.length > 0 || separateIds.size === 0) {
        for (const clip of sharedClips.length > 0 ? sharedClips : clips) {
          const existing = videoElements.get(clip.id)
          if (existing) {
            shared = existing
            break
          }
        }
        if (!shared) {
          for (const el of new Set(videoElements.values())) {
            const src = el.currentSrc || el.src || ''
            if (src && (src === url || src.endsWith(url))) {
              shared = el
              break
            }
          }
        }
        if (!shared) {
          shared = await loadExportVideoElement(primary)
        }
      }

      if (!keepUrls.has(url)) {
        if (shared) {
          shared.pause()
          shared.src = ''
          shared.load()
        }
        return
      }

      const occupied = new Set<HTMLVideoElement>()
      for (const clip of clips) {
        if (separateIds.has(clip.id)) {
          let el = videoElements.get(clip.id)
          if (!el || occupied.has(el) || (shared && el === shared)) {
            el = await loadExportVideoElement(clip)
          }
          occupied.add(el)
          videoElements.set(clip.id, el)
        } else if (shared) {
          occupied.add(shared)
          videoElements.set(clip.id, shared)
        }
      }
    })
  )
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'converting' | 'complete' | 'error'
  progress: number
  message: string
}

export type ProgressCallback = (progress: ExportProgress) => void

export async function exportVideo(
  videos: VideoClass[],
  aspectRatio: '9:16',
  onProgress?: ProgressCallback,
  images?: ImageClass[],
  texts?: TextClass[],
  effects?: EffectClass[],
  signal?: AbortSignal,
  audios?: AudioClass[]
): Promise<Blob> {
  const totalDuration = calculateTotalDuration(videos, images || [], texts, audios)

  if (totalDuration === 0) throw new Error('No content to export')

  await acquireFfmpegLock(() => {
    onProgress?.({ phase: 'preparing', progress: 0, message: 'Waiting for engine...' })
  })

  try {
    onProgress?.({ phase: 'preparing', progress: 0, message: 'Preparing elements...' })

    const imageElements = new Map<string, HTMLImageElement>()
    if (images && images.length > 0) {
      for (const image of images) {
        const img = new Image(); img.src = image.url
        try { await img.decode(); if (img.naturalWidth > 0) imageElements.set(image.id, img) } catch {}
      }
    }

    if (texts && texts.length > 0) {
      await preloadTextFonts(texts)
    }

    const width = 1080
    const height = 1920
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })!
    const effectsLayer = document.createElement('canvas')
    effectsLayer.width = width
    effectsLayer.height = height
    const effectsLayerCtx = effectsLayer.getContext('2d', { willReadFrequently: true })!

    const allVideos = [...videos]
    const videoElements: Map<string, HTMLVideoElement> = new Map()

    onProgress?.({ phase: 'preparing', progress: 5, message: 'Rendering audio track...' })

    // Offline audio rendering
    const offlineAudioBlob = await (async () => {
      const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalDuration * 44100)), 44100)
      
      // All manifest audios
      if (audios && audios.length > 0) {
        for (const audioItem of audios) {
          try {
            const resp = await fetch(audioItem.url)
            const buf = await resp.arrayBuffer()
            const audioBuf = await offlineCtx.decodeAudioData(buf)
            const source = offlineCtx.createBufferSource()
            source.buffer = audioBuf
            source.playbackRate.value = audioItem.playbackSpeed ?? 1
            
            const gainNode = offlineCtx.createGain()
            gainNode.gain.value = audioItem.volume ?? 1.0
            
            // Handle speed ramping for audio
            const sStart = audioItem.speedStart ?? audioItem.playbackSpeed ?? 1
            const sEnd = audioItem.speedEnd ?? audioItem.playbackSpeed ?? 1
            const pitch = audioItem.pitch ?? 1
            const timelineDuration = audioItem.endTime - audioItem.startTime
            const easing = audioItem.speedEasing ?? 'linear'
            const fadeOutDuration = Math.max(0, audioItem.fadeOutDuration ?? 0)
            
            if (Math.abs(sStart - sEnd) > 0.001) {
              if (easing === 'ease') {
                // Simulate cubic easing with a curve
                const points = 20
                const curve = new Float32Array(points)
                for (let i = 0; i < points; i++) {
                  const t = i / (points - 1)
                  const f = 3 * t * t - 2 * t * t * t
                  curve[i] = (sStart + (sEnd - sStart) * f) * pitch
                }
                source.playbackRate.setValueCurveAtTime(curve, audioItem.startTime, timelineDuration)
              } else {
                // Linear ramp for playbackRate
                source.playbackRate.setValueAtTime(sStart * pitch, audioItem.startTime)
                source.playbackRate.linearRampToValueAtTime(sEnd * pitch, audioItem.startTime + timelineDuration)
              }
            } else {
              source.playbackRate.value = sStart * pitch
            }
            
            source.connect(gainNode)
            gainNode.connect(offlineCtx.destination)

            if (fadeOutDuration > 0 && timelineDuration > 0) {
              const fadeStart = Math.max(audioItem.startTime, audioItem.endTime - fadeOutDuration)
              const baseVolume = audioItem.volume ?? 1.0
              gainNode.gain.setValueAtTime(baseVolume, audioItem.startTime)
              gainNode.gain.setValueAtTime(baseVolume, fadeStart)
              gainNode.gain.linearRampToValueAtTime(0, audioItem.endTime)
            }

            // Calculate how much source duration to consume
            const avgSpeed = (sStart + sEnd) / 2
            const sourceDurationToPlay = timelineDuration * avgSpeed * pitch
            
            source.start(audioItem.startTime, audioItem.trimStart, sourceDurationToPlay)
          } catch (e) { console.error(`Failed to load audio ${audioItem.id} for offline mix`, e) }
        }
      }
      
      // Video audios
      for (const v of allVideos) {
        if (v.muted) continue
        const mediaUrl = videoExportMediaUrl(v)
        if (!mediaUrl) continue
        try {
          const resp = await fetch(mediaUrl)
          const buf = await resp.arrayBuffer()
          const audioBuf = await offlineCtx.decodeAudioData(buf)
          const source = offlineCtx.createBufferSource()
          source.buffer = audioBuf
          const ps = v.playbackSpeed ?? 1
          const trimStart = v.trimStart ?? 0
          const trimEnd = v.trimEnd ?? 0
          const origDur = v.originalDuration ?? audioBuf.duration
          const avail = Math.max(0, origDur - trimStart - trimEnd)
          if (v.reversed) {
            source.playbackRate.value = -ps
            source.connect(offlineCtx.destination)
            source.start(v.timestamp ?? 0, trimStart + avail, avail / ps)
          } else {
            source.playbackRate.value = ps
            source.connect(offlineCtx.destination)
            source.start(v.timestamp ?? 0, trimStart, v.duration)
          }
        } catch (e) { console.error(`Failed to load audio for video ${v.id}`, e) }
      }

      const rendered = await offlineCtx.startRendering()
      return audioBufferToWav(rendered)
    })()

    onProgress?.({ phase: 'preparing', progress: 10, message: 'Setting up render...' })

    const logicalW = 1080
    const logicalH = 1920
    const xScale = width / logicalW
    const yScale = height / logicalH

    const renderFullFrame = async (t: number) => {
      await syncExportVideoPool(t, allVideos, images, videoElements)

      const isFirstFrame = t <= (1 / 60) * 0.5
      const ensureVideoReady = async (vEl: HTMLVideoElement, targetTime: number) => {
        const hasDecoded = videoElementHasDecodedFrame(vEl)

        const clampTime = (time: number) => {
          const dur = vEl.duration
          const minT = Math.max(0, time)
          if (!Number.isFinite(dur) || dur <= 0) return minT
          return Math.min(minT, Math.max(0, dur - 0.04))
        }

        const seekTo = async (time: number) => {
          await new Promise<void>((resolve) => {
            let resolved = false
            const onFinish = () => {
              if (resolved) return
              resolved = true
              vEl.removeEventListener('seeked', onFinish)
              vEl.removeEventListener('error', onFinish)
              resolve()
            }
            vEl.addEventListener('seeked', onFinish)
            vEl.addEventListener('error', onFinish)
            vEl.currentTime = clampTime(time)
            setTimeout(onFinish, isFirstFrame ? 2500 : 1500)
          })
        }

        // For the very first frame, force a tiny prime seek when we don't
        // yet have decoded frame data, so we don't paint black.
        if (isFirstFrame && !hasDecoded) {
          await seekTo(targetTime + 1 / 120)
          await seekTo(targetTime)
          return
        }

        const needsSeek = Math.abs(vEl.currentTime - targetTime) > 0.02
        if (needsSeek) {
          await seekTo(targetTime)
        }

        if (vEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve) => {
            if (vEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              resolve()
              return
            }
            const onCanPlay = () => {
              vEl.removeEventListener('canplay', onCanPlay)
              resolve()
            }
            vEl.addEventListener('canplay', onCanPlay)
            setTimeout(resolve, isFirstFrame ? 1500 : 500)
          })
        }
      }

      const videosToReady: { el: HTMLVideoElement; time: number }[] = []
      const ovs = allVideos.filter((v) => isVideoActiveAtTimelineTime(v, allVideos, t, images))
      for (const v of ovs) {
        const vEl = videoElements.get(v.id); if (vEl) {
          const elapsed = videoElapsedForMapping(v, t)
          const ovDur = clipTimelineSpanForSourceMap(manifestVideoTimelineSpanSeconds(v))
          const tmOvEx = videoTimelineSourceMapping(v, elapsed, ovDur)
          const localTime = videoSourceTrimBase(v) + tmOvEx.sourceElapsed
          videosToReady.push({ el: vEl, time: localTime })
        }
      }

      const overlayRowIdsForSeek = new Set<number>()
      for (const v of allVideos) {
        if (v.row >= 0) overlayRowIdsForSeek.add(v.row)
      }
      for (const img of images || []) {
        if (img.row >= 0) overlayRowIdsForSeek.add(img.row)
      }
      for (const row of overlayRowIdsForSeek) {
        const sortedR = getSortedRowItems(row, allVideos, images || [])
        const pr = findActiveAndNextItems(sortedR, t, allVideos)
        const tr = checkTransition(pr.activeItem, pr.nextItem, t)
        if (!tr.transitionActive || !pr.activeItem || !pr.nextItem) continue
        if (pr.nextItem.type === 'video') {
          const nv = pr.nextItem.item as VideoClass
          const nextEl = videoElements.get(nv.id)
          if (nextEl) videosToReady.push({ el: nextEl, time: videoSourceTrimBase(nv) })
        }
        if (pr.activeItem.type === 'video') {
          const av = pr.activeItem.item as VideoClass
          const currentEl = videoElements.get(av.id)
          if (currentEl) {
            const elapsed = Math.max(0, t - pr.activeItem.startTime)
            const avDur = clipTimelineSpanForSourceMap(manifestVideoTimelineSpanSeconds(av))
            const tmA = videoTimelineSourceMapping(av, elapsed, avDur)
            videosToReady.push({ el: currentEl, time: videoSourceTrimBase(av) + tmA.sourceElapsed })
          }
        }
      }

      if (videosToReady.length > 0) {
        const uniqueByEl = new Map<HTMLVideoElement, number>()
        for (const item of videosToReady) {
          if (!uniqueByEl.has(item.el)) uniqueByEl.set(item.el, item.time)
        }
        await Promise.all(
          [...uniqueByEl.entries()].map(([el, time]) => ensureVideoReady(el, time))
        )
      }

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      const exportCr = { x: 0, y: 0, width, height }
      const activeEffects =
        effects && effects.length > 0
          ? effects
              .filter((e) => t >= e.startTime && t < e.endTime)
              .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
          : []
      const useEffectsLayer = activeEffects.length > 0
      const drawCtx = useEffectsLayer ? effectsLayerCtx : ctx
      if (useEffectsLayer) {
        effectsLayerCtx.setTransform(1, 0, 0, 1, 0, 0)
        effectsLayerCtx.clearRect(0, 0, width, height)
      }

      type OverlayExportEntry =
        | { kind: 'image'; row: number; t0: number; img: ImageClass }
        | { kind: 'video'; row: number; t0: number; video: VideoClass }
        | { kind: 'text'; row: number; t0: number; text: TextClass }
      const overlayEntries: OverlayExportEntry[] = []
      for (const img of images || []) {
        if (img.row < 0 || !isImageActiveAtTimelineTime(img, allVideos, images || [], t)) continue
        overlayEntries.push({ kind: 'image', row: img.row, t0: img.startTime, img })
      }
      for (const v of ovs) {
        overlayEntries.push({ kind: 'video', row: v.row, t0: v.timestamp, video: v })
      }
      if (texts) {
        for (const txt of texts) {
          if (t < txt.startTime || t >= txt.endTime) continue
          overlayEntries.push({ kind: 'text', row: txt.row, t0: txt.startTime, text: txt })
        }
      }
      overlayEntries.sort((a, b) => a.row - b.row || a.t0 - b.t0)
      const overlayEntriesByRow = new Map<number, OverlayExportEntry[]>()
      for (const entry of overlayEntries) {
        const list = overlayEntriesByRow.get(entry.row) ?? []
        list.push(entry)
        overlayEntriesByRow.set(entry.row, list)
      }
      const rows = Array.from(new Set<number>([
        ...Array.from(overlayEntriesByRow.keys()),
        ...Array.from(overlayRowIdsForSeek.values()),
      ])).sort((a, b) => a - b)

      const skipOverlayExportIdsByRow = new Map<number, Set<string>>()
      for (const row of rows) {
        const sortedR = getSortedRowItems(row, allVideos, images || [])
        const pr = findActiveAndNextItems(sortedR, t, allVideos)
        const tr = checkTransition(pr.activeItem, pr.nextItem, t)
        if (pr.activeItem && pr.nextItem && tr.transitionActive && tr.progress < 1) {
          const renderedPair = renderClipTransitionPair(drawCtx, exportCr, t, pr.activeItem, pr.nextItem, tr.progress, (id) => {
            const el = videoElements.get(id)
            return el instanceof HTMLVideoElement ? el : undefined
          }, (id) => imageElements.get(id) ?? undefined)
          if (renderedPair) {
            skipOverlayExportIdsByRow.set(row, new Set([pr.activeItem.id, pr.nextItem.id]))
          }
        }
        const rowEntries = overlayEntriesByRow.get(row) ?? []
        for (let oi = 0; oi < rowEntries.length; oi++) {
          const entry = rowEntries[oi]
        const skippedIds = skipOverlayExportIdsByRow.get(entry.row)
        if (entry.kind === 'image' && skippedIds?.has(entry.img.id)) continue
        if (entry.kind === 'video' && skippedIds?.has(entry.video.id)) continue
        if (entry.kind === 'image') {
          const img = entry.img
          const iEl = imageElements.get(img.id); if (!iEl) continue
          drawCtx.save(); drawCtx.globalAlpha = img.opacity
          const imgElapsed = rowClipElapsedAtTime(
            { id: img.id, type: 'image', startTime: img.startTime, duration: img.duration, item: img },
            t
          )
          const prog = calculateAnimationProgress(img, t, img.startTime)
          const kox = resolveMediaKeyframeTransform(img, imgElapsed, img.duration)
          const ix = kox.x * xScale
          const iy = kox.y * yScale
          const iw = kox.width * xScale
          const ih = kox.height * yScale
          runWithPlacementRotation(drawCtx, ix, iy, iw, ih, img.rotation, (ox, oy) => {
            applyZoomTransform(drawCtx, img.animation, img.transition, prog, iEl, ox, oy, iw, ih, kox.cropSx, kox.cropSy, kox.cropSw, kox.cropSh, kox.zoomIntensity, img.duration, img.animationDuration, imgElapsed, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, img.transitionColor, img.transitionFlashMode, img.transitionDirection, img.transitionAxis, img.transitionSlideEasing, img.transitionCircleEasing, img.transitionWipeEasing, img.animationZoomEasing, undefined, img.zoomDistanceIntensity, undefined)
          }, img.flipHorizontal, img.flipVertical)
          drawCtx.restore()
        } else if (entry.kind === 'video') {
          const v = entry.video
          const vEl = videoElements.get(v.id); if (!vEl || !videoElementHasDecodedFrame(vEl)) continue
          const span = manifestVideoTimelineSpanSeconds(v)
          const elV = videoElapsedForMapping(v, t)
          const prog = calculateAnimationProgress(v, t, v.timestamp)
          const kvx = resolveMediaKeyframeTransform(v, elV, span)
          drawCtx.save(); drawCtx.globalAlpha = v.opacity
          runWithPlacementRotation(
            drawCtx,
            kvx.x * xScale,
            kvx.y * yScale,
            kvx.width * xScale,
            kvx.height * yScale,
            0,
            (px, py) => {
              applyZoomTransform(drawCtx, v.animation, v.transition, prog, vEl, px, py, kvx.width * xScale, kvx.height * yScale, kvx.cropSx, kvx.cropSy, kvx.cropSw, kvx.cropSh, kvx.zoomIntensity, manifestVideoTimelineSpanSeconds(v), v.animationDuration, elV, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v.transitionColor, v.transitionFlashMode, v.transitionDirection, v.transitionAxis, v.transitionSlideEasing, v.transitionCircleEasing, v.transitionWipeEasing, v.animationZoomEasing, undefined, v.zoomDistanceIntensity, undefined)
            },
            v.flipHorizontal,
            v.flipVertical
          )
          drawCtx.restore()
        } else {
          drawTextOverlay(drawCtx, entry.text, exportCr, t)
        }
      }
      }

      if (useEffectsLayer) {
        applyActiveEffects(effectsLayerCtx, activeEffects, 0, 0, width, height, t)
        ctx.drawImage(effectsLayer, 0, 0)
      }
    }

    const canvasStream = canvas.captureStream()
    const mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm', videoBitsPerSecond: 25_000_000 })
    const chunks: Blob[] = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        try {
          videoElements.forEach((_, id) => releaseExportVideoElement(id, videoElements))
          if (isCancelled || signal?.aborted) { releaseFfmpegLock(); reject(new DOMException('Export cancelled', 'AbortError')); return }
          onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })
          const webmBlob = new Blob(chunks, { type: 'video/webm' })
          chunks.length = 0
          if (webmBlob.size === 0) { releaseFfmpegLock(); reject(new Error('No recorded data')); return }
          
          onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })
          let ff; try { ff = await getFFmpeg(); ff.on('log', ({ message }) => console.log('[ffmpeg]', message)) } catch (err) { releaseFfmpegLock(); resolve(webmBlob); return }
          
          try {
            for (const f of ['input.webm', 'input.wav', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            const webmData = await fetchFile(webmBlob); await ff.writeFile('input.webm', webmData)
            const wavData = await fetchFile(offlineAudioBlob); await ff.writeFile('input.wav', wavData)
            
            onProgress?.({ phase: 'converting', progress: 97, message: 'Merging audio and video...' })
            // Combine silent webm and offline mixed wav
            const cmd = ['-y', '-i', 'input.webm', '-i', 'input.wav', '-vf', 'setpts=N/60/TB', '-t', totalDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-vsync', 'cfr', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output.mp4']
            await ff.exec(cmd)
            const mp4Data = await ff.readFile('output.mp4'); const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
            for (const f of ['input.webm', 'input.wav', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            terminateFFmpeg()
            releaseFfmpegLock(); onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' }); resolve(mp4Blob)
          } catch (err) {
            try {
              for (const f of ['input.webm', 'input.wav', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            } catch {}
            terminateFFmpeg()
            releaseFfmpegLock(); onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' }); resolve(webmBlob)
          }
        } catch (err) { releaseFfmpegLock(); reject(err) }
      }

      let isCancelled = false; let isFirstFrame = true
      const frameRate = 60
      const totalFrames = Math.max(1, Math.ceil(totalDuration * frameRate))

      ;(async () => {
        try {
          for (let frame = 0; frame < totalFrames && !signal?.aborted; frame++) {
            const currentTime = alignTimeToFrame(frame / frameRate, frameRate)
            if (isFirstFrame) { 
              isFirstFrame = false; 
              mediaRecorder.start(100) 
            }
            
            await renderFullFrame(currentTime)
            
            onProgress?.({ 
              phase: 'rendering', 
              progress: Math.min(95, 15 + ((frame + 1) / totalFrames) * 80), 
              message: `Rendering... ${Math.round(((frame + 1) / totalFrames) * 100)}%` 
            })

            // Wait for browser to actually paint the canvas and MediaRecorder to capture it.
            // Using a slightly larger delay than 0 to ensure the compositor picks up the frame.
            // This also ensures we don't overwhelm the MediaRecorder's encoding queue.
            await new Promise(r => setTimeout(r, 15))
          }
          
          // Give the recorder a moment to capture the final frame
          await new Promise(r => setTimeout(r, 200))
        } catch (err) {
          console.error('Render loop error:', err)
          videoElements.forEach((_, id) => releaseExportVideoElement(id, videoElements))
          chunks.length = 0
          reject(err)
          return
        }

        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        if (signal?.aborted) isCancelled = true
      })()
    })
  } finally { releaseFfmpegLock() }
}

export async function replaceVideoAudioTrack(
  videoBlob: Blob,
  audioBlob: Blob,
  options?: { trimStartSeconds?: number; durationSeconds?: number },
  onProgress?: (msg: string) => void
): Promise<Blob> {
  return withFfmpegLock(async () => {
    const ff = await getFFmpeg()
    for (const f of ['input.mp4', 'input-audio', 'output.mp4']) {
      try {
        await ff.deleteFile(f)
      } catch {}
    }
    await ff.writeFile('input.mp4', new Uint8Array(await videoBlob.arrayBuffer()))
    await ff.writeFile('input-audio', new Uint8Array(await audioBlob.arrayBuffer()))
    const trimStart = options?.trimStartSeconds ?? 0
    const duration = options?.durationSeconds
    const audioInputArgs =
      trimStart > 0 || duration !== undefined
        ? [
            '-ss',
            trimStart.toFixed(3),
            '-i',
            'input-audio',
            ...(duration !== undefined ? ['-t', duration.toFixed(3)] : []),
          ]
        : ['-i', 'input-audio']
    await ff.exec([
      '-i',
      'input.mp4',
      ...audioInputArgs,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      'output.mp4',
    ])
    const data = await ff.readFile('output.mp4')
    for (const f of ['input.mp4', 'input-audio', 'output.mp4']) {
      try {
        await ff.deleteFile(f)
      } catch {}
    }
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
  }, () => onProgress?.('Waiting for engine...'))
}

export async function extractVideoClip(url: string, startTime: number, duration: number, onProgress?: (msg: string) => void): Promise<Blob> {
  return withFfmpegLock(async () => {
    const ff = await getFFmpeg(); for (const f of ['input.mp4', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
    const inputData = await fetchFile(url); await ff.writeFile('input.mp4', inputData)
    await ff.exec(['-ss', startTime.toFixed(3), '-i', 'input.mp4', '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-avoid_negative_ts', 'make_zero', 'output.mp4'])
    const data = await ff.readFile('output.mp4'); for (const f of ['input.mp4', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
  }, () => onProgress?.('Waiting for engine...'))
}

export function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
