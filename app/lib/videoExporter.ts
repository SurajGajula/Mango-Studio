import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { wrapTextToLines } from '@/app/lib/textUtils'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import { getSortedMainItems, findActiveAndNextItems, checkTransition, calculateAnimationProgress, clipTimelineSpanForSourceMap, videoTimelineSourceMapping } from '@/app/lib/renderUtils'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { calculateTotalDuration } from '@/app/lib/timeUtils'
import { audioBufferToWav } from '@/app/lib/audioUtils'

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null
let ffmpegLock = false

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
  audioUrl?: string | null,
  texts?: TextClass[],
  audioTrimStart?: number,
  audioStartTime?: number,
  effects?: EffectClass[],
  signal?: AbortSignal,
  audios?: AudioClass[]
): Promise<Blob> {
  const mainVideos = [...videos].filter((v) => !v.isOverlay).sort((a, b) => a.timestamp - b.timestamp)
  const overlayVideos = videos.filter((v) => v.isOverlay)
  
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

    const allVideos = [...mainVideos, ...overlayVideos]
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

            // Calculate how much source duration to consume
            const avgSpeed = (sStart + sEnd) / 2
            const sourceDurationToPlay = timelineDuration * avgSpeed * pitch
            
            source.start(audioItem.startTime, audioItem.trimStart, sourceDurationToPlay)
          } catch (e) { console.error(`Failed to load audio ${audioItem.id} for offline mix`, e) }
        }
      }
      
      // Legacy background music if still present
      if (audioUrl && (!audios || audios.length === 0)) {
        try {
          const resp = await fetch(audioUrl)
          const buf = await resp.arrayBuffer()
          const audioBuf = await offlineCtx.decodeAudioData(buf)
          const source = offlineCtx.createBufferSource()
          source.buffer = audioBuf
          source.playbackRate.value = 1
          source.connect(offlineCtx.destination)
          source.start(audioStartTime ?? 0, audioTrimStart ?? 0)
        } catch (e) { console.error('Failed to load legacy bg audio for offline mix', e) }
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

    const allMainItems = getSortedMainItems(allVideos, images || [])

    const renderFullFrame = async (t: number) => {
      const ensureVideoReady = async (vEl: HTMLVideoElement, targetTime: number) => {
        const needsSeek = Math.abs(vEl.currentTime - targetTime) > 0.02
        if (needsSeek) {
          await new Promise<void>((resolve) => {
            let resolved = false
            const onSeeked = () => {
              if (resolved) return
              resolved = true
              vEl.removeEventListener('seeked', onSeeked)
              vEl.removeEventListener('error', onSeeked)
              resolve()
            }
            vEl.addEventListener('seeked', onSeeked)
            vEl.addEventListener('error', onSeeked)
            vEl.currentTime = targetTime
            setTimeout(onSeeked, 1500)
          })
        }
        if (vEl.readyState < 2) {
          await new Promise<void>((resolve) => {
            if (vEl.readyState >= 2) { resolve(); return }
            const onCanPlay = () => { vEl.removeEventListener('canplay', onCanPlay); resolve() }
            vEl.addEventListener('canplay', onCanPlay)
            setTimeout(resolve, 500)
          })
        }
      }

      const { activeItem: activeMain, nextItem: nextMain } = findActiveAndNextItems(allMainItems, t)
      const { transitionActive, progress } = checkTransition(activeMain, nextMain, t)

      const videosToReady: { el: HTMLVideoElement; time: number }[] = []
      if (transitionActive) {
        if (nextMain!.type === 'video') {
          const nv = nextMain!.item as VideoClass
          const nextEl = videoElements.get(nv.id); if (nextEl) videosToReady.push({ el: nextEl, time: nv.trimStart ?? 0 })
        }
        if (activeMain!.type === 'video') {
          const av = activeMain!.item as VideoClass
          const currentEl = videoElements.get(av.id); if (currentEl) {
            const elapsed = Math.max(0, t - activeMain!.startTime)
            const avDur = clipTimelineSpanForSourceMap(av.duration)
            const tmA = videoTimelineSourceMapping(av, elapsed, avDur)
            const localNow = (av.trimStart ?? 0) + tmA.sourceElapsed
            videosToReady.push({ el: currentEl, time: localNow })
          }
        }
      } else if (activeMain && activeMain.type === 'video') {
        const v = activeMain.item as VideoClass
        const vEl = videoElements.get(v.id); if (vEl) {
          const elapsed = Math.max(0, t - activeMain.startTime)
          const vDur = clipTimelineSpanForSourceMap(v.duration)
          const tmV = videoTimelineSourceMapping(v, elapsed, vDur)
          const localTime = (v.trimStart ?? 0) + tmV.sourceElapsed
          videosToReady.push({ el: vEl, time: localTime })
        }
      }

      const ovs = overlayVideos.filter(v => t >= v.timestamp && t < v.timestamp + (v.duration || 0))
      for (const v of ovs) {
        const vEl = videoElements.get(v.id); if (vEl) {
          const elapsed = Math.max(0, t - v.timestamp)
          const ovDur = clipTimelineSpanForSourceMap(v.duration)
          const tmOvEx = videoTimelineSourceMapping(v, elapsed, ovDur)
          const localTime = (v.trimStart ?? 0) + tmOvEx.sourceElapsed
          videosToReady.push({ el: vEl, time: localTime })
        }
      }

      if (videosToReady.length > 0) {
        await Promise.all(videosToReady.map(item => ensureVideoReady(item.el, item.time)))
      }

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      let transitionActiveState = false
      if (transitionActive && nextMain && activeMain) {
        transitionActiveState = true
        const elapsedB = Math.max(0, t - nextMain.startTime)
        const elapsedA = Math.max(0, t - activeMain.startTime)
        let nextEl: HTMLVideoElement | HTMLImageElement | null = null
        let nextParams: any = undefined
        if (nextMain.type === 'video') {
          const nv = nextMain.item as VideoClass
          nextEl = videoElements.get(nv.id) || null
          if (nextEl && nextEl.readyState >= 2) {
            const kn = resolveMediaKeyframeTransform(nv, elapsedB, nv.duration ?? 0)
            nextParams = {
              x: (nv.x ?? 0) * xScale,
              y: (nv.y ?? 0) * yScale,
              w: (nv.width ?? logicalW) * xScale,
              h: (nv.height ?? logicalH) * yScale,
              sx: nextEl.videoWidth * kn.cropSx,
              sy: nextEl.videoHeight * kn.cropSy,
              sw: nextEl.videoWidth * kn.cropSw,
              sh: nextEl.videoHeight * kn.cropSh,
            }
          }
        } else {
          const ni = nextMain.item as ImageClass
          nextEl = imageElements.get(ni.id) || null
          if (nextEl) {
            const kn = resolveMediaKeyframeTransform(ni, elapsedB, ni.duration)
            nextParams = {
              x: ni.x * xScale,
              y: ni.y * yScale,
              w: ni.width * xScale,
              h: ni.height * yScale,
              sx: nextEl.naturalWidth * kn.cropSx,
              sy: nextEl.naturalHeight * kn.cropSy,
              sw: nextEl.naturalWidth * kn.cropSw,
              sh: nextEl.naturalHeight * kn.cropSh,
            }
          }
        }

        if (nextEl && nextParams) {
          let curEl: HTMLVideoElement | HTMLImageElement | null = null
          let curParams: any = undefined
          if (activeMain.type === 'video') {
            const av = activeMain.item as VideoClass
            curEl = videoElements.get(av.id) || null
            if (curEl && curEl.readyState >= 2) {
              const ka = resolveMediaKeyframeTransform(av, elapsedA, av.duration ?? 0)
              curParams = {
                x: (av.x ?? 0) * xScale,
                y: (av.y ?? 0) * yScale,
                w: (av.width ?? logicalW) * xScale,
                h: (av.height ?? logicalH) * yScale,
                sx: curEl.videoWidth * ka.cropSx,
                sy: curEl.videoHeight * ka.cropSy,
                sw: curEl.videoWidth * ka.cropSw,
                sh: curEl.videoHeight * ka.cropSh,
              }
            }
          } else {
            const ai = activeMain.item as ImageClass
            curEl = imageElements.get(ai.id) || null
            if (curEl) {
              const ka = resolveMediaKeyframeTransform(ai, elapsedA, ai.duration)
              curParams = {
                x: ai.x * xScale,
                y: ai.y * yScale,
                w: ai.width * xScale,
                h: ai.height * yScale,
                sx: curEl.naturalWidth * ka.cropSx,
                sy: curEl.naturalHeight * ka.cropSy,
                sw: curEl.naturalWidth * ka.cropSw,
                sh: curEl.naturalHeight * ka.cropSh,
              }
            }
          }

          if (curEl && curParams) {
            const nextItem = nextMain.item
            const activeItem = activeMain.item
            const progA = calculateAnimationProgress(activeItem, t, activeMain.startTime)
            const kn = nextMain.type === 'video'
              ? resolveMediaKeyframeTransform(nextItem as VideoClass, elapsedB, (nextItem as VideoClass).duration ?? 0)
              : resolveMediaKeyframeTransform(nextItem as ImageClass, elapsedB, (nextItem as ImageClass).duration)
            const ka = activeMain.type === 'video'
              ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
              : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)

            applyZoomTransform(
              ctx,
              nextItem.animation,
              nextItem.transition,
              progress,
              nextEl,
              nextParams.x, nextParams.y, nextParams.w, nextParams.h,
              kn.cropSx, kn.cropSy, kn.cropSw, kn.cropSh,
              kn.zoomIntensity,
              nextItem.duration,
              nextItem.animationDuration,
              elapsedB,
              curEl,
              activeItem.animation,
              progA,
              elapsedA,
              ka.zoomIntensity,
              activeItem.duration,
              activeItem.animationDuration,
              curParams,
              nextItem.transitionColor,
              nextItem.transitionDirection,
              nextItem.transitionAxis
            )
          }
        }
      }

      if (!transitionActiveState && activeMain) {
        if (activeMain.type === 'video') {
          const v = activeMain.item as VideoClass
          const vEl = videoElements.get(v.id)
          if (vEl && vEl.readyState >= 2) {
            const prog = calculateAnimationProgress(v, t, v.timestamp)
            const elapsedM = Math.max(0, t - v.timestamp)
            const kv = resolveMediaKeyframeTransform(v, elapsedM, v.duration ?? 0)
            applyZoomTransform(ctx, v.animation, v.transition, prog, vEl, (v.x ?? 0) * xScale, (v.y ?? 0) * yScale, (v.width ?? logicalW) * xScale, (v.height ?? logicalH) * yScale, kv.cropSx, kv.cropSy, kv.cropSw, kv.cropSh, kv.zoomIntensity, v.duration, v.animationDuration, elapsedM)
          }
        } else {
          const img = activeMain.item as ImageClass
          const iEl = imageElements.get(img.id)
          if (iEl) {
            const prog = calculateAnimationProgress(img, t, img.startTime)
            const kim = resolveMediaKeyframeTransform(img, t - img.startTime, img.duration)
            applyZoomTransform(ctx, img.animation, img.transition, prog, iEl, img.x * xScale, img.y * yScale, img.width * xScale, img.height * yScale, kim.cropSx, kim.cropSy, kim.cropSw, kim.cropSh, kim.zoomIntensity, img.duration, img.animationDuration, t - img.startTime)
          }
        }
      }

      type OverlayExportEntry =
        | { kind: 'image'; row: number; t0: number; img: ImageClass }
        | { kind: 'video'; row: number; t0: number; video: VideoClass }
        | { kind: 'text'; row: number; t0: number; text: TextClass }
      const overlayEntries: OverlayExportEntry[] = []
      for (const img of images || []) {
        if (img.isMainTrack || t < img.startTime || t >= img.endTime) continue
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

      for (let oi = 0; oi < overlayEntries.length; oi++) {
        const entry = overlayEntries[oi]
        if (entry.kind === 'image') {
          const img = entry.img
          const iEl = imageElements.get(img.id); if (!iEl) continue
          ctx.save(); ctx.globalAlpha = img.opacity
          const prog = calculateAnimationProgress(img, t, img.startTime)
          const kox = resolveMediaKeyframeTransform(img, t - img.startTime, img.duration)
          applyZoomTransform(ctx, img.animation, img.transition, prog, iEl, img.x * xScale, img.y * yScale, img.width * xScale, img.height * yScale, kox.cropSx, kox.cropSy, kox.cropSw, kox.cropSh, kox.zoomIntensity, img.duration, img.animationDuration, t - img.startTime)
          ctx.restore()
        } else if (entry.kind === 'video') {
          const v = entry.video
          const vEl = videoElements.get(v.id); if (!vEl || vEl.readyState < 2) continue
          const prog = calculateAnimationProgress(v, t, v.timestamp)
          const elV = Math.max(0, t - v.timestamp)
          const kvx = resolveMediaKeyframeTransform(v, elV, v.duration ?? 0)
          ctx.save(); ctx.globalAlpha = v.opacity
          applyZoomTransform(ctx, v.animation, v.transition, prog, vEl, v.x * xScale, v.y * yScale, v.width * xScale, v.height * yScale, kvx.cropSx, kvx.cropSy, kvx.cropSw, kvx.cropSh, kvx.zoomIntensity, v.duration, v.animationDuration, elV)
          ctx.restore()
        } else {
          const text = entry.text
          const fontPx = text.fontSize * xScale; const lineHeight = fontPx * 1.2; ctx.save()
          ctx.font = `${text.fontWeight} ${fontPx}px ${resolveCanvasFont(text.fontFamily)}`
          let content = text.content
          if (text.animation === 'keyboard') {
            const words = content.split(/\s+/); const duration = text.endTime - text.startTime
            if (duration > 0 && words.length > 0) { content = words.slice(0, Math.min(words.length, Math.floor((t - text.startTime) / (duration / words.length)) + 1)).join(' ') }
          }
          const lines = wrapTextToLines(ctx, content, text.width * xScale)
          const textX = text.textAlign === 'center' ? text.x * xScale + (text.width * xScale) / 2 : (text.textAlign === 'right' ? text.x * xScale + text.width * xScale : text.x * xScale)
          ctx.textAlign = text.textAlign as CanvasTextAlign; ctx.textBaseline = 'top'; ctx.globalAlpha = text.opacity
          if (text.style === 'negative') {
            ctx.globalCompositeOperation = 'difference'
            ctx.fillStyle = '#ffffff'
          } else if (text.style === 'highlight') {
            ctx.globalCompositeOperation = 'source-over'
            ctx.fillStyle = '#000000'
            ctx.fillRect(text.x * xScale, text.y * yScale, text.width * xScale, lines.length * lineHeight)
            ctx.fillStyle = '#ffff00'
          } else {
            ctx.shadowColor = '#000000'; ctx.shadowBlur = fontPx * 0.12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
            ctx.fillStyle = text.color
          }
          lines.forEach((line, i) => ctx.fillText(line, textX, text.y * yScale + i * lineHeight))
          if (text.style !== 'negative' && text.style !== 'highlight') {
            lines.forEach((line, i) => ctx.fillText(line, textX, text.y * yScale + i * lineHeight))
          }
          ctx.restore()
        }
      }

      if (effects && effects.length > 0) {
        const activeEffects = effects
          .filter((e) => t >= e.startTime && t < e.endTime)
          .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
        for (let ei = 0; ei < activeEffects.length; ei++) {
          applyEffect(ctx, activeEffects[ei].type, 0, 0, width, height, t, activeEffects[ei].intensity)
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

      let isCancelled = false; let isFirstFrame = true; let currentTime = 0
      const frameRate = 60
      const frameStep = 1 / frameRate

      ;(async () => {
        try {
          while (currentTime < totalDuration - 0.001 && !signal?.aborted) {
            if (isFirstFrame) { 
              isFirstFrame = false; 
              mediaRecorder.start(100) 
            }
            
            await renderFullFrame(currentTime)
            
            onProgress?.({ 
              phase: 'rendering', 
              progress: Math.min(95, 15 + (currentTime / totalDuration) * 80), 
              message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` 
            })
            
            currentTime += frameStep
            
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
