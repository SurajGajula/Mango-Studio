import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { getKeyboardVisibleWordCount, wrapTextToLines } from '@/app/lib/textUtils'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { runWithPlacementRotation } from '@/app/lib/placementRotation'
import { applyEffect } from '@/app/lib/applyEffect'
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
import { audioBufferToWav } from '@/app/lib/audioUtils'

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null
let ffmpegLock = false

function videoElementHasDrawableFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= 1
}

function videoElementHasDecodedFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) return ffmpegLoading
  ffmpegLoading = (async () => {
    try {
      const ff = new FFmpeg()
      const BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ])
      const loadPromise = ff.load({ coreURL, wasmURL })
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('FFmpeg load timeout')), 15000))
      await Promise.race([loadPromise, timeoutPromise])
      ffmpegInstance = ff
      return ff
    } catch (err) {
      ffmpegLoading = null; ffmpegInstance = null; throw err
    }
  })()
  return ffmpegLoading
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'converting' | 'complete' | 'error'
  progress: number
  message: string
}

export type ProgressCallback = (progress: ExportProgress) => void

function resolveCanvasFont(fontFamily: string): string {
  return fontFamily.split(',').map((f) => f.trim()).filter((f) => !f.startsWith('var(')).join(', ')
}

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

  while (ffmpegLock) {
    onProgress?.({ phase: 'preparing', progress: 0, message: 'Waiting for engine...' })
    await new Promise(r => setTimeout(r, 500))
  }
  ffmpegLock = true

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
      const fontSpecs = new Set(texts.map((t) => `${t.fontWeight} 72px ${resolveCanvasFont(t.fontFamily)}`))
      await Promise.all([...fontSpecs].map((spec) => document.fonts.load(spec).catch(() => {})))
    }

    const width = 1080
    const height = 1920
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })!

    const allVideos = [...videos]
    const videoElements: Map<string, HTMLVideoElement> = new Map()

    if (allVideos.length > 0) {
      await Promise.all(allVideos.map((clip) =>
        new Promise<void>((resolve, reject) => {
          const video = document.createElement('video'); video.preload = 'auto'; video.playsInline = true; video.muted = true
          if (clip.url) setVideoCrossOriginForUrl(video, clip.url)
          video.src = clip.url || ''
          video.onloadeddata = () => { videoElements.set(clip.id, video); resolve() }
          video.onerror = () => reject(new Error(`Failed to load video: ${clip.title}`))
          video.load()
        })
      ))
    }

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
        if (v.muted || !v.url) continue
        try {
          const resp = await fetch(v.url)
          const buf = await resp.arrayBuffer()
          const audioBuf = await offlineCtx.decodeAudioData(buf)
          const source = offlineCtx.createBufferSource()
          source.buffer = audioBuf
          source.playbackRate.value = v.playbackSpeed ?? 1
          source.connect(offlineCtx.destination)
          source.start(v.timestamp ?? 0, v.trimStart ?? 0, v.duration)
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
      const ovs = allVideos.filter((v) => t >= v.timestamp && t < v.timestamp + manifestVideoTimelineSpanSeconds(v))
      for (const v of ovs) {
        const vEl = videoElements.get(v.id); if (vEl) {
          const elapsed = Math.max(0, t - v.timestamp)
          const ovDur = clipTimelineSpanForSourceMap(manifestVideoTimelineSpanSeconds(v))
          const tmOvEx = videoTimelineSourceMapping(v, elapsed, ovDur)
          const localTime = (v.trimStart ?? 0) + tmOvEx.sourceElapsed
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
        const pr = findActiveAndNextItems(sortedR, t)
        const tr = checkTransition(pr.activeItem, pr.nextItem, t)
        if (!tr.transitionActive || !pr.activeItem || !pr.nextItem) continue
        if (pr.nextItem.type === 'video') {
          const nv = pr.nextItem.item as VideoClass
          const nextEl = videoElements.get(nv.id)
          if (nextEl) videosToReady.push({ el: nextEl, time: nv.trimStart ?? 0 })
        }
        if (pr.activeItem.type === 'video') {
          const av = pr.activeItem.item as VideoClass
          const currentEl = videoElements.get(av.id)
          if (currentEl) {
            const elapsed = Math.max(0, t - pr.activeItem.startTime)
            const avDur = clipTimelineSpanForSourceMap(manifestVideoTimelineSpanSeconds(av))
            const tmA = videoTimelineSourceMapping(av, elapsed, avDur)
            videosToReady.push({ el: currentEl, time: (av.trimStart ?? 0) + tmA.sourceElapsed })
          }
        }
      }

      if (videosToReady.length > 0) {
        await Promise.all(videosToReady.map(item => ensureVideoReady(item.el, item.time)))
      }

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      const exportCr = { x: 0, y: 0, width, height }

      type OverlayExportEntry =
        | { kind: 'image'; row: number; t0: number; img: ImageClass }
        | { kind: 'video'; row: number; t0: number; video: VideoClass }
        | { kind: 'text'; row: number; t0: number; text: TextClass }
      const overlayEntries: OverlayExportEntry[] = []
      for (const img of images || []) {
        if (img.row < 0 || t < img.startTime || t >= img.endTime) continue
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
        const pr = findActiveAndNextItems(sortedR, t)
        const tr = checkTransition(pr.activeItem, pr.nextItem, t)
        if (pr.activeItem && pr.nextItem && tr.transitionActive && tr.progress < 1) {
          const renderedPair = renderClipTransitionPair(ctx, exportCr, t, pr.activeItem, pr.nextItem, tr.progress, (id) => {
            const el = videoElements.get(id)
            return el && videoElementHasDecodedFrame(el) ? el : undefined
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
          ctx.save(); ctx.globalAlpha = img.opacity
          const prog = calculateAnimationProgress(img, t, img.startTime)
          const kox = resolveMediaKeyframeTransform(img, t - img.startTime, img.duration)
          const ix = kox.x * xScale
          const iy = kox.y * yScale
          const iw = kox.width * xScale
          const ih = kox.height * yScale
          runWithPlacementRotation(ctx, ix, iy, iw, ih, img.rotation, (ox, oy) => {
            applyZoomTransform(ctx, img.animation, img.transition, prog, iEl, ox, oy, iw, ih, kox.cropSx, kox.cropSy, kox.cropSw, kox.cropSh, kox.zoomIntensity, img.duration, img.animationDuration, t - img.startTime, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, img.transitionColor, img.transitionFlashMode, img.transitionDirection, img.transitionAxis, img.transitionSlideEasing, img.transitionCircleEasing, img.transitionWipeEasing, img.animationZoomEasing, undefined, img.zoomDistanceIntensity, undefined)
          }, img.flipHorizontal, img.flipVertical)
          ctx.restore()
        } else if (entry.kind === 'video') {
          const v = entry.video
          const vEl = videoElements.get(v.id); if (!vEl || !videoElementHasDecodedFrame(vEl)) continue
          const prog = calculateAnimationProgress(v, t, v.timestamp)
          const elV = Math.max(0, t - v.timestamp)
          const kvx = resolveMediaKeyframeTransform(v, elV, manifestVideoTimelineSpanSeconds(v))
          ctx.save(); ctx.globalAlpha = v.opacity
          runWithPlacementRotation(
            ctx,
            kvx.x * xScale,
            kvx.y * yScale,
            kvx.width * xScale,
            kvx.height * yScale,
            0,
            (px, py) => {
              applyZoomTransform(ctx, v.animation, v.transition, prog, vEl, px, py, kvx.width * xScale, kvx.height * yScale, kvx.cropSx, kvx.cropSy, kvx.cropSw, kvx.cropSh, kvx.zoomIntensity, manifestVideoTimelineSpanSeconds(v), v.animationDuration, elV, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v.transitionColor, v.transitionFlashMode, v.transitionDirection, v.transitionAxis, v.transitionSlideEasing, v.transitionCircleEasing, v.transitionWipeEasing, v.animationZoomEasing, undefined, v.zoomDistanceIntensity, undefined)
            },
            v.flipHorizontal,
            v.flipVertical
          )
          ctx.restore()
        } else {
          const text = entry.text
          const fontPx = text.fontSize * xScale; const lineHeight = fontPx * 1.2; ctx.save()
          ctx.font = `${text.fontWeight} ${fontPx}px ${resolveCanvasFont(text.fontFamily)}`
          const content = text.content
          const words = content.split(/\s+/).filter((w) => w.length > 0)
          const keyboardVisible =
            text.animation === 'keyboard' && words.length > 0
              ? getKeyboardVisibleWordCount(content, text.startTime, text.endTime, t)
              : null
          const lines = wrapTextToLines(ctx, content, text.width * xScale)
          const textX = text.textAlign === 'center' ? text.x * xScale + (text.width * xScale) / 2 : (text.textAlign === 'right' ? text.x * xScale + text.width * xScale : text.x * xScale)
          const savedAlign = text.textAlign as CanvasTextAlign
          ctx.textAlign = savedAlign; ctx.textBaseline = 'top'; ctx.globalAlpha = text.opacity
          if (text.style === 'negative') {
            ctx.globalCompositeOperation = 'difference'
            ctx.fillStyle = '#ffffff'
          } else if (text.style === 'highlight') {
            ctx.globalCompositeOperation = 'source-over'
            ctx.fillStyle = '#000000'
            ctx.fillRect(text.x * xScale, text.y * yScale, text.width * xScale, lines.length * lineHeight)
            ctx.fillStyle = '#ffffff'
          } else {
            ctx.shadowColor = '#000000'; ctx.shadowBlur = fontPx * 0.12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
            ctx.fillStyle = text.color
          }
          const drawTextLines = () => {
            if (keyboardVisible === null) {
              lines.forEach((line, i) => ctx.fillText(line, textX, text.y * yScale + i * lineHeight))
              return
            }
            ctx.textAlign = 'left'
            let nextWordIndex = 0
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              const y = text.y * yScale + i * lineHeight
              const parts = line.split(' ')
              const partWordIndex = parts.map((w) => (w === '' ? null : nextWordIndex++))
              const lineWidth = ctx.measureText(line).width
              const startX =
                savedAlign === 'center'
                  ? textX - lineWidth / 2
                  : savedAlign === 'right'
                    ? textX - lineWidth
                    : textX
              let x = startX
              for (let p = 0; p < parts.length; p++) {
                const w = parts[p]
                if (p > 0) {
                  let j = p
                  while (j < parts.length && parts[j] === '') j++
                  const spVis =
                    j < parts.length &&
                    partWordIndex[j] !== null &&
                    partWordIndex[j]! < keyboardVisible
                  const sp = ' '
                  const spW = ctx.measureText(sp).width
                  if (spVis) ctx.fillText(sp, x, y)
                  x += spW
                }
                if (w !== '' && partWordIndex[p] !== null) {
                  if (partWordIndex[p]! < keyboardVisible) {
                    ctx.fillText(w, x, y)
                  }
                  x += ctx.measureText(w).width
                }
              }
            }
            ctx.textAlign = savedAlign
          }
          const drawWithOptionalShake = () => {
            if (text.animation !== 'shake') {
              drawTextLines()
              return
            }
            const duration = Math.max(0.001, text.endTime - text.startTime)
            const localTime = Math.max(0, t - text.startTime)
            const normalized = Math.min(1, localTime / duration)
            const envelope = 0.6 + 0.4 * Math.sin(normalized * Math.PI)
            const angle = localTime * 2 * Math.PI
            const shiftX = Math.sin(angle * 2.0) * 0.06 * fontPx * envelope
            const shiftY = Math.cos(angle * 2.3) * 0.04 * fontPx * envelope
            const rotate = Math.sin(angle * 1.6) * 0.9 * envelope * (Math.PI / 180)
            const centerX = text.x * xScale + (text.width * xScale) / 2
            const centerY = text.y * yScale + (lines.length * lineHeight) / 2
            ctx.save()
            ctx.translate(centerX + shiftX, centerY + shiftY)
            ctx.rotate(rotate)
            ctx.translate(-centerX, -centerY)
            drawTextLines()
            ctx.restore()
          }
          drawWithOptionalShake()
          if (text.style !== 'negative' && text.style !== 'highlight') {
            drawWithOptionalShake()
          }
          ctx.restore()
        }
      }
      }

      if (effects && effects.length > 0) {
        const activeEffects = effects
          .filter((e) => t >= e.startTime && t < e.endTime)
          .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
        for (let ei = 0; ei < activeEffects.length; ei++) {
          applyEffect(
            ctx,
            activeEffects[ei].type,
            0,
            0,
            width,
            height,
            t,
            activeEffects[ei].intensity,
            activeEffects[ei].contrast,
            activeEffects[ei].flashSpeed
          )
        }
      }
    }

    const canvasStream = canvas.captureStream()
    const mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm', videoBitsPerSecond: 25_000_000 })
    const chunks: Blob[] = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        try {
          videoElements.forEach(v => { v.pause(); v.src = '' })
          if (isCancelled || signal?.aborted) { ffmpegLock = false; reject(new DOMException('Export cancelled', 'AbortError')); return }
          onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })
          const webmBlob = new Blob(chunks, { type: 'video/webm' })
          if (chunks.length === 0 || webmBlob.size === 0) { ffmpegLock = false; reject(new Error('No recorded data')); return }
          
          onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })
          let ff: FFmpeg; try { ff = await getFFmpeg(); ff.on('log', ({ message }) => console.log('[ffmpeg]', message)) } catch (err) { ffmpegLock = false; resolve(webmBlob); return }
          
          try {
            for (const f of ['input.webm', 'input.wav', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            const webmData = await fetchFile(webmBlob); await ff.writeFile('input.webm', webmData)
            const wavData = await fetchFile(offlineAudioBlob); await ff.writeFile('input.wav', wavData)
            
            onProgress?.({ phase: 'converting', progress: 97, message: 'Merging audio and video...' })
            // Combine silent webm and offline mixed wav
            const cmd = ['-y', '-i', 'input.webm', '-i', 'input.wav', '-vf', 'setpts=N/60/TB', '-t', totalDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-vsync', 'cfr', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output.mp4']
            await ff.exec(cmd)
            const mp4Data = await ff.readFile('output.mp4'); const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
            ffmpegLock = false; onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' }); resolve(mp4Blob)
          } catch (err) {
            ffmpegLock = false; onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' }); resolve(webmBlob)
          }
        } catch (err) { ffmpegLock = false; reject(err) }
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
          reject(err)
          return
        }

        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        if (signal?.aborted) isCancelled = true
      })()
    })
  } finally { ffmpegLock = false }
}

export async function extractVideoClip(url: string, startTime: number, duration: number, onProgress?: (msg: string) => void): Promise<Blob> {
  while (ffmpegLock) { onProgress?.('Waiting for engine...'); await new Promise(r => setTimeout(r, 500)) }
  ffmpegLock = true
  try {
    const ff = await getFFmpeg(); for (const f of ['input.mp4', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
    const inputData = await fetchFile(url); await ff.writeFile('input.mp4', inputData)
    await ff.exec(['-ss', startTime.toFixed(3), '-i', 'input.mp4', '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-avoid_negative_ts', 'make_zero', 'output.mp4'])
    const data = await ff.readFile('output.mp4'); for (const f of ['input.mp4', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
  } finally { ffmpegLock = false }
}

export function terminateFFmpeg() { if (ffmpegInstance) { try { ffmpegInstance.terminate() } catch {}; ffmpegInstance = null; ffmpegLoading = null } }
export function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
