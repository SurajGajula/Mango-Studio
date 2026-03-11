import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { EffectClass } from '@/app/models/EffectClass'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { wrapTextToLines } from '@/app/lib/textUtils'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance
  }
  
  if (ffmpegLoading) {
    return ffmpegLoading
  }
  
  ffmpegLoading = (async () => {
    ffmpegInstance = new FFmpeg()

    const BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ])

    await ffmpegInstance.load({
      coreURL,
      wasmURL,
    })
    
    return ffmpegInstance
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
  return fontFamily
    .split(',')
    .map((f) => f.trim())
    .filter((f) => !f.startsWith('var('))
    .join(', ')
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
  signal?: AbortSignal
): Promise<Blob> {
  const mainVideos = [...videos].filter((v) => !v.isOverlay).sort((a, b) => a.timestamp - b.timestamp)
  const overlayVideos = videos.filter((v) => v.isOverlay)

  const videoDuration = mainVideos.reduce((sum, v) => sum + (v.duration || 0), 0)
  const maxImageEnd = images
    ? images.filter((img) => img.isMainTrack).reduce((max, img) => Math.max(max, img.endTime), 0)
    : 0
  const totalDuration = Math.max(videoDuration, maxImageEnd)

  if (totalDuration === 0) {
    throw new Error('No content to export')
  }

  onProgress?.({ phase: 'preparing', progress: 0, message: 'Preparing elements...' })

  const imageElements = new Map<string, HTMLImageElement>()
  if (images && images.length > 0) {
    for (const image of images) {
      const img = new Image()
      img.src = image.url
      try {
        await img.decode()
        if (img.naturalWidth > 0) imageElements.set(image.id, img)
      } catch {
        // failed to decode — skip
      }
    }
  }

  if (texts && texts.length > 0) {
    const fontSpecs = new Set(
      texts.map((t) => `${t.fontWeight} 72px ${resolveCanvasFont(t.fontFamily)}`)
    )
    await Promise.all([...fontSpecs].map((spec) => document.fonts.load(spec).catch(() => {})))
  }

  const width = aspectRatio === '16:9' ? 1920 : 1080
  const height = aspectRatio === '16:9' ? 1080 : 1920

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const allVideos = [...mainVideos, ...overlayVideos]
  const videoElements: Map<string, HTMLVideoElement> = new Map()

  if (allVideos.length > 0) {
    await Promise.all(allVideos.map((clip) =>
      new Promise<void>((resolve, reject) => {
        const video = document.createElement('video')
        video.preload = 'auto'
        video.playsInline = true
        video.muted = false
        video.src = clip.url || ''
        video.onloadeddata = () => { videoElements.set(clip.id, video); resolve() }
        video.onerror = () => reject(new Error(`Failed to load video: ${clip.title}`))
        video.load()
      })
    ))
  }

  onProgress?.({ phase: 'preparing', progress: 10, message: 'Setting up...' })

  const xScale = width / 1920
  const yScale = height / 1080

  const drawFrameToCanvas = (t: number, fillBlack = true) => {
    if (fillBlack) {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)
    }
    if (images && images.length > 0) {
      let activeImages = images.filter((img) => t >= img.startTime && t < img.endTime)
      const activeMain = activeImages.filter((img) => img.isMainTrack)
      if (activeMain.length === 0) {
        const lastEnded = images
          .filter((img) => img.isMainTrack && img.endTime <= t)
          .sort((a, b) => b.endTime - a.endTime)[0]
        if (lastEnded) activeImages = [lastEnded, ...activeImages.filter((img) => !img.isMainTrack)]
      }
      activeImages
        .sort((a, b) => (a.isMainTrack ? -1 : 1) - (b.isMainTrack ? -1 : 1))
        .forEach((image) => {
          const img = imageElements.get(image.id)
          if (!img || img.naturalWidth === 0) return
          const imageElapsed = t - image.startTime
          const progress = image.duration > 0 ? imageElapsed / image.duration : 0
          ctx.save()
          ctx.globalAlpha = image.opacity
          applyZoomTransform(ctx, image.zoom, progress, img, image.x * xScale, image.y * yScale, image.width * xScale, image.height * yScale, image.cropSx, image.cropSy, image.cropSw, image.cropSh, image.zoomIntensity, imageElapsed)
          ctx.restore()
        })
    }
    overlayVideos
      .filter((v) => t >= v.timestamp && t < v.timestamp + (v.duration ?? 0))
      .forEach((video) => {
        const videoEl = videoElements.get(video.id)
        if (!videoEl || videoEl.readyState < 2) return
        const localTime = (video.trimStart ?? 0) + (t - video.timestamp)
        if (Math.abs(videoEl.currentTime - localTime) > 0.1) videoEl.currentTime = localTime
        const vDuration = video.duration ?? 0
        const vElapsed = t - video.timestamp
        const vProgress = vDuration > 0 ? vElapsed / vDuration : 0
        ctx.save()
        ctx.globalAlpha = video.opacity
        applyZoomTransform(ctx, video.zoom, vProgress, videoEl, video.x * xScale, video.y * yScale, video.width * xScale, video.height * yScale, 0, 0, 1, 1, video.zoomIntensity, vElapsed)
        ctx.restore()
      })
    if (texts && texts.length > 0) {
      const activeTexts = texts.filter((text) => t >= text.startTime && t < text.endTime)
      for (const text of activeTexts) {
        const fontPx = text.fontSize * xScale
        const lineHeight = fontPx * 1.2
        const shadowOffset = fontPx * 0.04
        const shadowBlur = fontPx * 0.08

        ctx.save()
        const canvasFont = resolveCanvasFont(text.fontFamily)
        ctx.font = `${text.fontWeight} ${fontPx}px ${canvasFont}`

        const lines = wrapTextToLines(ctx, text.content, text.width * xScale)
        const textX = text.textAlign === 'center'
          ? text.x * xScale + (text.width * xScale) / 2
          : text.textAlign === 'right'
          ? text.x * xScale + text.width * xScale
          : text.x * xScale
        const baseY = text.y * yScale
        ctx.textAlign = text.textAlign as CanvasTextAlign
        ctx.textBaseline = 'top'
        ctx.globalAlpha = text.opacity

        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
          ctx.shadowColor = 'rgba(0,0,0,0.8)'
          ctx.shadowBlur = shadowBlur
          ctx.shadowOffsetX = ox * shadowOffset
          ctx.shadowOffsetY = oy * shadowOffset
          lines.forEach((line, i) => ctx.fillText(line, textX, baseY + i * lineHeight))
        }
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.fillStyle = text.color
        lines.forEach((line, i) => ctx.fillText(line, textX, baseY + i * lineHeight))
        ctx.restore()
      }
    }
  }

  const audioContext = new AudioContext()
  await audioContext.resume()

  const audioDestination = audioContext.createMediaStreamDestination()
  const audioSources: Map<string, MediaElementAudioSourceNode> = new Map()

  mainVideos.forEach((clip) => {
    const video = videoElements.get(clip.id)
    if (!video) return
    video.muted = false
    video.volume = 1
    const source = audioContext.createMediaElementSource(video)
    audioSources.set(clip.id, source)
  })

  let bgAudioElement: HTMLAudioElement | null = null
  if (audioUrl) {
    bgAudioElement = new Audio(audioUrl)
    bgAudioElement.preload = 'auto'
    await new Promise<void>((resolve) => {
      bgAudioElement!.oncanplaythrough = () => resolve()
      bgAudioElement!.onerror = () => resolve()
      bgAudioElement!.load()
    })
    const bgSource = audioContext.createMediaElementSource(bgAudioElement)
    bgSource.connect(audioDestination)
  }

  const hasAudio = !!audioUrl || mainVideos.length > 0

  const canvasStream = canvas.captureStream(0)
  const canvasTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const combinedStream = hasAudio
    ? new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ])
    : new MediaStream([...canvasStream.getVideoTracks()])

  const mimeType = hasAudio
    ? MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm'

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  })

  const chunks: Blob[] = []
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })


  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      videoElements.forEach((v) => { v.pause(); v.src = '' })
      if (bgAudioElement) { bgAudioElement.pause(); bgAudioElement.src = '' }
      audioContext.close()

      if (isCancelled || signal?.aborted) {
        reject(new DOMException('Export cancelled', 'AbortError'))
        return
      }

      onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })

      const webmBlob = new Blob(chunks, { type: mimeType })
      console.log(`[export] chunks=${chunks.length} webmSize=${(webmBlob.size / 1024 / 1024).toFixed(2)}MB mimeType=${mimeType}`)

      if (chunks.length === 0 || webmBlob.size === 0) {
        reject(new Error('No recorded data'))
        return
      }

      onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })
      console.log('[export] loading FFmpeg...')

      let ff: FFmpeg
      try {
        ff = await getFFmpeg()
        ff.on('log', ({ message }) => console.log('[ffmpeg]', message))
        console.log('[export] FFmpeg loaded')
      } catch (err) {
        console.error('[export] FFmpeg load failed:', err)
        onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' })
        resolve(webmBlob)
        return
      }

      if (signal?.aborted) {
        reject(new DOMException('Export cancelled', 'AbortError'))
        return
      }

      let ffCancelled = false
      let raceReject: (reason: unknown) => void = () => {}
      const raceBreaker = new Promise<never>((_, rej) => { raceReject = rej })

      const killFFmpeg = () => {
        if (ffCancelled) return
        ffCancelled = true
        console.log('[export] killFFmpeg called — terminating worker')
        try { ff.terminate() } catch {}
        ffmpegInstance = null
        ffmpegLoading = null
        raceReject(new DOMException('Export cancelled', 'AbortError'))
      }

      signal?.addEventListener('abort', killFFmpeg, { once: true })

      const timeoutId = setTimeout(() => {
        console.warn('[export] FFmpeg timeout fired after 5 min')
        killFFmpeg()
      }, 5 * 60 * 1000)

      try {
        for (const f of ['input.webm', 'output.mp4']) {
          try { await ff.deleteFile(f) } catch {}
        }
        console.log('[export] writing input.webm to WASM FS...')

        const webmData = await fetchFile(webmBlob)
        console.log(`[export] fetchFile done, byteLength=${webmData.byteLength}`)
        await ff.writeFile('input.webm', webmData)
        console.log('[export] writeFile done — starting exec')

        onProgress?.({ phase: 'converting', progress: 97, message: 'Converting to MP4...' })

        const cmd = [
          '-y',
          '-i', 'input.webm',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-tune', 'fastdecode',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-vsync', 'cfr',
          ...(hasAudio
            ? ['-c:a', 'aac', '-b:a', '128k', '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0']
            : ['-an']),
          '-movflags', '+faststart',
          'output.mp4',
        ]
        console.log('[export] ffmpeg cmd:', cmd.join(' '))

        const execStart = Date.now()
        await Promise.race([ff.exec(cmd), raceBreaker])
        console.log(`[export] exec done in ${((Date.now() - execStart) / 1000).toFixed(1)}s`)

        clearTimeout(timeoutId)

        console.log('[export] reading output.mp4...')
        const mp4Data = await ff.readFile('output.mp4')
        const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
        console.log(`[export] mp4 size=${(mp4Blob.size / 1024 / 1024).toFixed(2)}MB`)

        for (const f of ['input.webm', 'output.mp4']) {
          try { await ff.deleteFile(f) } catch {}
        }

        onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' })
        resolve(mp4Blob)
      } catch (err) {
        clearTimeout(timeoutId)
        if (ffCancelled || signal?.aborted) {
          console.log('[export] cancelled/timed-out — rejecting')
          reject(new DOMException('Export cancelled', 'AbortError'))
          return
        }
        console.error('[export] FFmpeg exec error:', err)
        onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' })
        resolve(webmBlob)
      } finally {
        signal?.removeEventListener('abort', killFFmpeg)
      }
    }

    mediaRecorder.onerror = (e) => {
      onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' })
      reject(e)
    }

    let isCancelled = false

    mediaRecorder.start(100)

    let currentTime = 0
    let lastRafTimestamp: number | null = null
    let activeClipId: string | null = null
    let activeVideoEl: HTMLVideoElement | null = null
    let animationId: number
    let rafFrameCount = 0

    const applyActiveEffect = (t: number) => {
      if (!effects || effects.length === 0) return
      const activeEffect = effects.find((e) => t >= e.startTime && t < e.endTime)
      if (activeEffect) applyEffect(ctx, activeEffect.type, 0, 0, width, height, t)
    }

    const renderFrame = (rafTimestamp: number) => {
      if (signal?.aborted) {
        isCancelled = true
        if (activeVideoEl) activeVideoEl.pause()
        cancelAnimationFrame(animationId)
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        return
      }

      if (currentTime >= totalDuration) {
        if (activeVideoEl) activeVideoEl.pause()
        cancelAnimationFrame(animationId)
        mediaRecorder.stop()
        return
      }

      const activeClip = mainVideos.find(
        (v) => v.duration && currentTime >= v.timestamp && currentTime < v.timestamp + v.duration
      )

      if (activeClip) {
        const videoEl = videoElements.get(activeClip.id) || null

        if (activeClip.id !== activeClipId) {
          if (activeVideoEl && !activeVideoEl.paused) activeVideoEl.pause()
          if (activeClipId && audioSources.has(activeClipId)) {
            try { audioSources.get(activeClipId)!.disconnect(audioDestination) } catch {}
          }
          activeClipId = activeClip.id
          activeVideoEl = videoEl
          if (activeVideoEl) {
            const trimStart = activeClip.trimStart ?? 0
            activeVideoEl.currentTime = trimStart + Math.max(0, currentTime - activeClip.timestamp)
            activeVideoEl.play().catch(() => {})
          }
          if (audioSources.has(activeClip.id)) {
            audioSources.get(activeClip.id)!.connect(audioDestination)
          }
          lastRafTimestamp = null
        }

        if (videoEl && videoEl.readyState >= 2) {
          const trimStart = activeClip.trimStart ?? 0
          const trimEnd = activeClip.trimEnd ?? 0
          const originalDuration = activeClip.originalDuration ?? activeClip.duration ?? 0
          const playbackEnd = originalDuration - trimEnd

          currentTime = activeClip.timestamp + Math.max(0, videoEl.currentTime - trimStart)

          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          const videoAspect = videoEl.videoWidth / videoEl.videoHeight
          const canvasAspect = width / height
          let dw = width, dh = height, dx = 0, dy = 0
          if (videoAspect > canvasAspect) { dh = width / videoAspect; dy = (height - dh) / 2 }
          else { dw = height * videoAspect; dx = (width - dw) / 2 }
          ctx.drawImage(videoEl, dx, dy, dw, dh)

          drawFrameToCanvas(currentTime, false)
          applyActiveEffect(currentTime)
          rafFrameCount++
          if (rafFrameCount % 2 === 0) canvasTrack?.requestFrame?.()

          const progress = 15 + (currentTime / totalDuration) * 80
          onProgress?.({ phase: 'rendering', progress: Math.min(95, progress), message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` })

          if (videoEl.ended || videoEl.currentTime >= playbackEnd - 0.05) {
            videoEl.pause()
            if (audioSources.has(activeClip.id)) {
              try { audioSources.get(activeClip.id)!.disconnect(audioDestination) } catch {}
            }
            currentTime = activeClip.timestamp + (activeClip.duration || 0)
            activeClipId = null
            activeVideoEl = null
            lastRafTimestamp = null
          }
        }
      } else {
        if (activeClipId) {
          if (activeVideoEl && !activeVideoEl.paused) activeVideoEl.pause()
          if (audioSources.has(activeClipId)) {
            try { audioSources.get(activeClipId)!.disconnect(audioDestination) } catch {}
          }
          activeClipId = null
          activeVideoEl = null
        }

        const frameDelta = lastRafTimestamp !== null
          ? Math.min((rafTimestamp - lastRafTimestamp) / 1000, 1 / 30)
          : 0
        currentTime = Math.min(currentTime + frameDelta, totalDuration)
        lastRafTimestamp = rafTimestamp

        drawFrameToCanvas(currentTime)
        applyActiveEffect(currentTime)
        rafFrameCount++
        if (rafFrameCount % 2 === 0) canvasTrack?.requestFrame?.()

        const progress = 15 + (currentTime / totalDuration) * 80
        onProgress?.({ phase: 'rendering', progress: Math.min(95, progress), message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` })
      }

      animationId = requestAnimationFrame(renderFrame)
    }

    if (bgAudioElement) {
      bgAudioElement.currentTime = audioTrimStart ?? 0
      const audioDelay = audioStartTime ?? 0
      if (audioDelay > 0) {
        setTimeout(() => {
          if (bgAudioElement && !bgAudioElement.ended) bgAudioElement.play().catch(() => {})
        }, audioDelay * 1000)
      } else {
        bgAudioElement.play().catch(() => {})
      }
    }

    animationId = requestAnimationFrame(renderFrame)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
