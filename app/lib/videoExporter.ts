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
import { getSortedMainItems, findActiveAndNextItems, checkTransition } from '@/app/lib/renderUtils'

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
  aspectRatio: '16:9' | '9:16',
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
  const mainImages = (images || []).filter(img => img.isMainTrack).sort((a, b) => a.startTime - b.startTime)

  const videoDuration = mainVideos.reduce((max, v) => Math.max(max, (v.timestamp ?? 0) + (v.duration || 0)), 0)
  const imageDuration = mainImages.reduce((max, img) => Math.max(max, img.endTime), 0)
  const totalDuration = Math.max(videoDuration, imageDuration)

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

    const width = aspectRatio === '16:9' ? 1920 : 1080
    const height = aspectRatio === '16:9' ? 1080 : 1920
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })!

    const allVideos = [...mainVideos, ...overlayVideos]
    const videoElements: Map<string, HTMLVideoElement> = new Map()

    if (allVideos.length > 0) {
      await Promise.all(allVideos.map((clip) =>
        new Promise<void>((resolve, reject) => {
          const video = document.createElement('video'); video.preload = 'auto'; video.playsInline = true; video.muted = clip.muted; video.src = clip.url || ''
          video.onloadeddata = () => { videoElements.set(clip.id, video); resolve() }
          video.onerror = () => reject(new Error(`Failed to load video: ${clip.title}`))
          video.load()
        })
      ))
    }

    onProgress?.({ phase: 'preparing', progress: 10, message: 'Setting up...' })

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = width / logicalW
    const yScale = height / logicalH

    const allMainItems = getSortedMainItems(allVideos, images || [])

    const renderFullFrame = async (t: number) => {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      const { activeItem: activeMain, nextItem: nextMain } = findActiveAndNextItems(allMainItems, t)
      const { transitionActive, progress } = checkTransition(activeMain, nextMain, t)

      let transitionActiveState = false

      // Helper to wait for video to be ready at the target time
      const ensureVideoReady = async (vEl: HTMLVideoElement, targetTime: number) => {
        if (Math.abs(vEl.currentTime - targetTime) > 0.02) {
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              vEl.removeEventListener('seeked', onSeeked)
              resolve()
            }
            vEl.addEventListener('seeked', onSeeked)
            vEl.currentTime = targetTime
            // Safety timeout
            setTimeout(onSeeked, 150)
          })
        }
      }

      if (transitionActive) {
        transitionActiveState = true
        let nextEl: HTMLVideoElement | HTMLImageElement | null = null
        let nextParams: any = undefined
        
        if (nextMain!.type === 'video') {
          const nv = nextMain!.item as VideoClass
          nextEl = videoElements.get(nv.id) || null
          if (nextEl && nextEl.readyState >= 2) {
            const localNext = nv.trimStart ?? 0
            await ensureVideoReady(nextEl, localNext)
            nextParams = { x: (nv.x ?? 0) * xScale, y: (nv.y ?? 0) * yScale, w: (nv.width ?? logicalW) * xScale, h: (nv.height ?? logicalH) * yScale, sx: nextEl.videoWidth * (nv.cropSx ?? 0), sy: nextEl.videoHeight * (nv.cropSy ?? 0), sw: nextEl.videoWidth * (nv.cropSw ?? 1), sh: nextEl.videoHeight * (nv.cropSh ?? 1) }
          }
        } else {
          const ni = nextMain!.item as ImageClass
          nextEl = imageElements.get(ni.id) || null
          if (nextEl) nextParams = { x: ni.x * xScale, y: ni.y * yScale, w: ni.width * xScale, h: ni.height * yScale, sx: nextEl.naturalWidth * ni.cropSx, sy: nextEl.naturalHeight * ni.cropSy, sw: nextEl.naturalWidth * ni.cropSw, sh: nextEl.naturalHeight * ni.cropSh }
        }

        if (nextEl && nextParams) {
          ctx.drawImage(nextEl, nextParams.sx, nextParams.sy, nextParams.sw, nextParams.sh, nextParams.x, nextParams.y, nextParams.w, nextParams.h)
          let currentEl: HTMLVideoElement | HTMLImageElement | null = null
          let currentParams: any = undefined
          if (activeMain!.type === 'video') {
            const av = activeMain!.item as VideoClass
            currentEl = videoElements.get(av.id) || null
            if (currentEl && currentEl.readyState >= 2) {
              const localNow = (av.trimStart ?? 0) + (t - activeMain!.startTime) * (av.playbackSpeed ?? 1)
              await ensureVideoReady(currentEl, localNow)
              currentParams = { x: (av.x ?? 0) * xScale, y: (av.y ?? 0) * yScale, w: (av.width ?? logicalW) * xScale, h: (av.height ?? logicalH) * yScale, sx: currentEl.videoWidth * (av.cropSx ?? 0), sy: currentEl.videoHeight * (av.cropSy ?? 0), sw: currentEl.videoWidth * (av.cropSw ?? 1), sh: currentEl.videoHeight * (av.cropSh ?? 1) }
            }
          } else {
            const ai = activeMain!.item as ImageClass
            currentEl = imageElements.get(ai.id) || null
            if (currentEl) currentParams = { x: ai.x * xScale, y: ai.y * yScale, w: ai.width * xScale, h: ai.height * yScale, sx: currentEl.naturalWidth * ai.cropSx, sy: currentEl.naturalHeight * ai.cropSy, sw: currentEl.naturalWidth * ai.cropSw, sh: currentEl.naturalHeight * ai.cropSh }
          }

          if (currentEl && currentParams) {
            applyZoomTransform(ctx, nextMain!.item.zoom, progress, nextEl, nextParams.x, nextParams.y, nextParams.w, nextParams.h, nextMain!.item.cropSx, nextMain!.item.cropSy, nextMain!.item.cropSw, nextMain!.item.cropSh, nextMain!.item.zoomIntensity, 0, currentEl, currentParams)
          }
        }
      }

      if (!transitionActiveState && activeMain) {
        if (activeMain.type === 'video') {
          const v = activeMain.item as VideoClass
          const vEl = videoElements.get(v.id)
          if (vEl && vEl.readyState >= 2) {
            const localTime = (v.trimStart ?? 0) + (t - activeMain.startTime) * (v.playbackSpeed ?? 1)
            await ensureVideoReady(vEl, localTime)
            if (vEl.paused) { vEl.playbackRate = v.playbackSpeed ?? 1; vEl.play().catch(() => {}); if (audioSources.has(v.id)) audioSources.get(v.id)!.connect(audioDestination) }
            
            const isSplit = v.zoom === 'split-horizontal' || v.zoom === 'split-vertical'
            let progress = 0
            if (isSplit) progress = 1
            else if (v.zoom === 'in' || v.zoom === 'out') {
              const transDur = Math.max(0.1, v.transitionDuration ?? 1.0)
              const elapsed = t - v.timestamp
              progress = Math.max(0, Math.min(1, elapsed / transDur))
            } else progress = v.duration && v.duration > 0 ? (t - v.timestamp) / v.duration : 0
            
            applyZoomTransform(ctx, v.zoom, progress, vEl, (v.x ?? 0) * xScale, (v.y ?? 0) * yScale, (v.width ?? logicalW) * xScale, (v.height ?? logicalH) * yScale, v.cropSx, v.cropSy, v.cropSw, v.cropSh, v.zoomIntensity, (t - v.timestamp))
          }
        } else {
          const img = activeMain.item as ImageClass
          const iEl = imageElements.get(img.id)
          if (iEl) {
            const isSplit = img.zoom === 'split-horizontal' || img.zoom === 'split-vertical'
            let progress = 0
            if (isSplit) progress = 1
            else if (img.zoom === 'in' || img.zoom === 'out') {
              const transDur = Math.max(0.1, img.transitionDuration ?? 1.0)
              const elapsed = t - img.startTime
              progress = Math.max(0, Math.min(1, elapsed / transDur))
            } else progress = img.duration > 0 ? (t - img.startTime) / img.duration : 0
            
            applyZoomTransform(ctx, img.zoom, progress, iEl, img.x * xScale, img.y * yScale, img.width * xScale, img.height * yScale, img.cropSx, img.cropSy, img.cropSw, img.cropSh, img.zoomIntensity, (t - img.startTime))
          }
        }
      }

      (images || []).filter(img => !img.isMainTrack && t >= img.startTime && t < img.endTime).forEach(img => {
        const iEl = imageElements.get(img.id); if (!iEl) return
        ctx.save(); ctx.globalAlpha = img.opacity
        let progress = 0
        if (img.zoom === 'in' || img.zoom === 'out') {
          const transDur = Math.max(0.1, img.transitionDuration ?? 1.0)
          const elapsed = t - img.startTime
          progress = Math.max(0, Math.min(1, elapsed / transDur))
        } else progress = img.duration > 0 ? (t - img.startTime) / img.duration : 0
        applyZoomTransform(ctx, img.zoom, progress, iEl, img.x * xScale, img.y * yScale, img.width * xScale, img.height * yScale, img.cropSx, img.cropSy, img.cropSw, img.cropSh, img.zoomIntensity, (t - img.startTime))
        ctx.restore()
      })

      const ovs = overlayVideos.filter(v => t >= v.timestamp && t < v.timestamp + (v.duration || 0))
      for (const v of ovs) {
        const vEl = videoElements.get(v.id); if (!vEl || vEl.readyState < 2) continue
        const localTime = (v.trimStart ?? 0) + (t - v.timestamp) * (v.playbackSpeed ?? 1)
        await ensureVideoReady(vEl, localTime)
        let progress = 0
        if (v.zoom === 'in' || v.zoom === 'out') {
          const transDur = Math.max(0.1, v.transitionDuration ?? 1.0)
          const elapsed = t - v.timestamp
          progress = Math.max(0, Math.min(1, elapsed / transDur))
        } else progress = (v.duration ?? 0) > 0 ? (t - v.timestamp) / (v.duration ?? 1) : 0
        ctx.save(); ctx.globalAlpha = v.opacity
        applyZoomTransform(ctx, v.zoom, progress, vEl, v.x * xScale, v.y * yScale, v.width * xScale, v.height * yScale, v.cropSx, v.cropSy, v.cropSw, v.cropSh, v.zoomIntensity, localTime)
        ctx.restore()
      }

      if (texts && texts.length > 0) {
        texts.filter(txt => t >= txt.startTime && t < txt.endTime).forEach(text => {
          const fontPx = text.fontSize * xScale; const lineHeight = fontPx * 1.2; ctx.save()
          ctx.font = `${text.fontWeight} ${fontPx}px ${resolveCanvasFont(text.fontFamily)}`
          let content = text.content
          if (text.animation === 'keyboard') {
            const words = content.split(/\s+/); const duration = text.endTime - text.startTime
            if (duration > 0 && words.length > 0) { content = words.slice(0, Math.min(words.length, Math.floor((t - text.startTime) / (duration / words.length)) + 1)).join(' ') }
          }
          const lines = wrapTextToLines(ctx, content, text.width * xScale)
          const textX = text.textAlign === 'center' ? text.x * xScale + (text.width * xScale) / 2 : (text.textAlign === 'right' ? text.x * xScale + text.width * xScale : text.x * xScale)
          ctx.textAlign = text.textAlign as CanvasTextAlign; ctx.textBaseline = 'top'; ctx.globalAlpha = text.opacity; ctx.fillStyle = 'rgba(0,0,0,0.8)'
          for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) lines.forEach((line, i) => ctx.fillText(line, textX + ox * (fontPx * 0.04), text.y * yScale + i * lineHeight + oy * (fontPx * 0.04)))
          ctx.fillStyle = text.color; lines.forEach((line, i) => ctx.fillText(line, textX, text.y * yScale + i * lineHeight))
          ctx.restore()
        })
      }

      if (effects) {
        const eff = effects.find(e => t >= e.startTime && t < e.endTime)
        if (eff) applyEffect(ctx, eff.type, 0, 0, width, height, t)
      }
    }

    const audioContext = new AudioContext(); await audioContext.resume()
    const audioDestination = audioContext.createMediaStreamDestination()
    const audioSources: Map<string, MediaElementAudioSourceNode> = new Map()
    mainVideos.forEach(clip => {
      const v = videoElements.get(clip.id); if (!v) return; v.muted = clip.muted; v.volume = clip.muted ? 0 : 1
      audioSources.set(clip.id, audioContext.createMediaElementSource(v))
    })

    let bgAudio: HTMLAudioElement | null = null
    if (audioUrl) {
      bgAudio = new Audio(audioUrl); bgAudio.preload = 'auto'
      await new Promise<void>(res => { bgAudio!.oncanplaythrough = () => res(); bgAudio!.onerror = () => res(); bgAudio!.load() })
      audioContext.createMediaElementSource(bgAudio).connect(audioDestination)
    }

    const hasAudio = !!audioUrl || mainVideos.length > 0
    const canvasStream = canvas.captureStream(60)
    const combinedStream = hasAudio ? new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]) : new MediaStream([...canvasStream.getVideoTracks()])
    const mimeType = hasAudio ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')) : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
    const mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 25_000_000 })
    const chunks: Blob[] = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        try {
          videoElements.forEach(v => { v.pause(); v.src = '' }); if (bgAudio) { bgAudio.pause(); bgAudio.src = '' }; audioContext.close()
          if (isCancelled || signal?.aborted) { ffmpegLock = false; reject(new DOMException('Export cancelled', 'AbortError')); return }
          onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })
          const webmBlob = new Blob(chunks, { type: mimeType })
          if (chunks.length === 0 || webmBlob.size === 0) { ffmpegLock = false; reject(new Error('No recorded data')); return }
          onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })
          let ff: FFmpeg; try { ff = await getFFmpeg(); ff.on('log', ({ message }) => console.log('[ffmpeg]', message)) } catch (err) { ffmpegLock = false; onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' }); resolve(webmBlob); return }
          if (signal?.aborted) { ffmpegLock = false; reject(new DOMException('Export cancelled', 'AbortError')); return }
          let ffCancelled = false; let raceReject: (r: any) => void = () => {}; const raceBreaker = new Promise<never>((_, rej) => { raceReject = rej })
          const killFFmpeg = () => { if (ffCancelled) return; ffCancelled = true; try { ff.terminate() } catch {}; ffmpegInstance = null; ffmpegLoading = null; raceReject(new DOMException('Export cancelled', 'AbortError')) }
          signal?.addEventListener('abort', killFFmpeg, { once: true })
          const timeoutId = setTimeout(() => killFFmpeg(), 5 * 60 * 1000)
          try {
            for (const f of ['input.webm', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            const webmData = await fetchFile(webmBlob); await ff.writeFile('input.webm', webmData)
            onProgress?.({ phase: 'converting', progress: 97, message: 'Converting to MP4...' })
            const cmd = ['-y', '-i', 'input.webm', '-vf', 'setpts=N/60/TB', '-t', totalDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-vsync', 'cfr', ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-af', `aresample=async=1:min_hard_comp=0.100000:first_pts=0,atrim=0:${totalDuration.toFixed(3)}`] : ['-an']), '-movflags', '+faststart', 'output.mp4']
            await Promise.race([ff.exec(cmd), raceBreaker]); clearTimeout(timeoutId)
            const mp4Data = await ff.readFile('output.mp4'); const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
            for (const f of ['input.webm', 'output.mp4']) try { await ff.deleteFile(f) } catch {}
            onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' }); ffmpegLock = false; resolve(mp4Blob)
          } catch (err) {
            clearTimeout(timeoutId); ffmpegLock = false; if (ffCancelled || signal?.aborted) { reject(new DOMException('Export cancelled', 'AbortError')); return }
            onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' }); resolve(webmBlob)
          } finally { signal?.removeEventListener('abort', killFFmpeg) }
        } catch (err) { ffmpegLock = false; onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' }); reject(err) }
      }
      mediaRecorder.onerror = (e) => { ffmpegLock = false; onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' }); reject(e) }

      let isCancelled = false; let isFirstFrame = true; let currentTime = 0
      const startAudio = () => { if (bgAudio) { bgAudio.playbackRate = audios?.[0]?.playbackSpeed ?? 1; bgAudio.currentTime = audioTrimStart ?? 0; if (audioStartTime && audioStartTime > 0) setTimeout(() => { if (bgAudio && !bgAudio.ended) bgAudio.play().catch(() => {}) }, audioStartTime * 1000); else bgAudio.play().catch(() => {}) } }

      (async () => {
        const frameRate = 60
        const frameStep = 1 / frameRate
        
        while (currentTime < totalDuration && !signal?.aborted) {
          if (isFirstFrame) { 
            isFirstFrame = false
            mediaRecorder.start(100)
            startAudio() 
          }
          
          await renderFullFrame(currentTime)
          
          onProgress?.({ phase: 'rendering', progress: Math.min(95, 15 + (currentTime / totalDuration) * 80), message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` })
          
          currentTime += frameStep
          
          // Use a fixed delay instead of requestAnimationFrame to avoid 
          // 2x speed on high-refresh rate (120Hz+) monitors.
          await new Promise(r => setTimeout(r, 1000 / frameRate))
        }

        // Wait a small moment to ensure the very last frame is processed by the encoder
        await new Promise(r => setTimeout(r, 100))

        if (signal?.aborted) isCancelled = true
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
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
