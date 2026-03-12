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
let ffmpegLock = false

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance
  }
  
  if (ffmpegLoading) {
    return ffmpegLoading
  }
  
  ffmpegLoading = (async () => {
    try {
      const ff = new FFmpeg()

      const BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ])

      const loadPromise = ff.load({
        coreURL,
        wasmURL,
      })
      
      // 15 second timeout for engine load
      const timeoutPromise = new Promise((_, rej) => 
        setTimeout(() => rej(new Error('FFmpeg load timeout')), 15000)
      )

      await Promise.race([loadPromise, timeoutPromise])
      
      ffmpegInstance = ff
      return ff
    } catch (err) {
      ffmpegLoading = null
      ffmpegInstance = null
      throw err
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

  const videoDuration = mainVideos.reduce((max, v) => Math.max(max, (v.timestamp ?? 0) + (v.duration || 0)), 0)
  const maxImageEnd = images
    ? images.filter((img) => img.isMainTrack).reduce((max, img) => Math.max(max, img.endTime), 0)
    : 0
  const totalDuration = Math.max(videoDuration, maxImageEnd)

  if (totalDuration === 0) {
    throw new Error('No content to export')
  }

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
        video.muted = clip.muted
        video.src = clip.url || ''
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
        const cropSx = video.cropSx ?? 0
        const cropSy = video.cropSy ?? 0
        const cropSw = video.cropSw ?? 1
        const cropSh = video.cropSh ?? 1
        applyZoomTransform(ctx, video.zoom, vProgress, videoEl, video.x * xScale, video.y * yScale, video.width * xScale, video.height * yScale, cropSx, cropSy, cropSw, cropSh, video.zoomIntensity, vElapsed)
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

      let content = text.content
      if (text.animation === 'keyboard') {
        const words = content.split(/\s+/)
        const duration = text.endTime - text.startTime
        if (duration > 0 && words.length > 0) {
          const wordDuration = duration / words.length
          const elapsed = t - text.startTime
          const visibleCount = Math.min(words.length, Math.floor(elapsed / wordDuration) + 1)
          content = words.slice(0, visibleCount).join(' ')
        }
      }

      const lines = wrapTextToLines(ctx, content, text.width * xScale)
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
    video.muted = clip.muted
    video.volume = clip.muted ? 0 : 1
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

  const canvasStream = canvas.captureStream(30)
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
    videoBitsPerSecond: 12_000_000,
  })

  const chunks: Blob[] = []
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })


  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      try {
        videoElements.forEach((v) => { v.pause(); v.src = '' })
      if (bgAudioElement) { bgAudioElement.pause(); bgAudioElement.src = '' }
      audioContext.close()

      if (isCancelled || signal?.aborted) {
        ffmpegLock = false
        reject(new DOMException('Export cancelled', 'AbortError'))
        return
      }

      onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })

      const webmBlob = new Blob(chunks, { type: mimeType })
      console.log(`[export] chunks=${chunks.length} webmSize=${(webmBlob.size / 1024 / 1024).toFixed(2)}MB mimeType=${mimeType}`)

      if (chunks.length === 0 || webmBlob.size === 0) {
        ffmpegLock = false
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
        ffmpegLock = false
        onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' })
        resolve(webmBlob)
        return
      }

      if (signal?.aborted) {
        ffmpegLock = false
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
          '-t', totalDuration.toFixed(3),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-tune', 'fastdecode',
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
        ffmpegLock = false
        resolve(mp4Blob)
      } catch (err) {
        clearTimeout(timeoutId)
        ffmpegLock = false
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
    } catch (err) {
      ffmpegLock = false
      onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' })
      reject(err)
    }
  }

  mediaRecorder.onerror = (e) => {
      ffmpegLock = false
      onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' })
      reject(e)
    }

    let isCancelled = false
    let isFirstFrame = true

    let currentTime = 0
    let lastRafTimestamp: number | null = null
    let activeClipId: string | null = null
    let activeVideoEl: HTMLVideoElement | null = null
    let animationId: number

    const applyActiveEffect = (t: number) => {
      if (!effects || effects.length === 0) return
      const activeEffect = effects.find((e) => t >= e.startTime && t < e.endTime)
      if (activeEffect) applyEffect(ctx, activeEffect.type, 0, 0, width, height, t)
    }

    const startAudio = () => {
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
    }

    const renderFrame = (rafTimestamp: number) => {
      if (signal?.aborted) {
        isCancelled = true
        if (activeVideoEl) activeVideoEl.pause()
        if (bgAudioElement) bgAudioElement.pause()
        cancelAnimationFrame(animationId)
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        return
      }

      if (currentTime >= totalDuration) {
        if (activeVideoEl) activeVideoEl.pause()
        if (bgAudioElement) bgAudioElement.pause()
        cancelAnimationFrame(animationId)
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        return
      }

      const delta = lastRafTimestamp !== null ? (rafTimestamp - lastRafTimestamp) / 1000 : 0
      lastRafTimestamp = rafTimestamp

      // Only advance time if we're not waiting for a new clip to be ready
      let shouldAdvance = true
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
            // Don't play yet, wait for readyState
          }
        }

        if (videoEl && videoEl.readyState >= 2) {
          if (isFirstFrame) {
            isFirstFrame = false
            mediaRecorder.start(100)
            startAudio()
          }

          const trimStart = activeClip.trimStart ?? 0
          const localTimeInOriginal = trimStart + (currentTime - activeClip.timestamp)
          
          if (videoEl.paused) {
            videoEl.play().catch(() => {})
            if (audioSources.has(activeClip.id)) {
              audioSources.get(activeClip.id)!.connect(audioDestination)
            }
          }

          // Sync video to master clock
          if (Math.abs(videoEl.currentTime - localTimeInOriginal) > 0.1) {
            videoEl.currentTime = localTimeInOriginal
          }

          const logicalW = aspectRatio === '16:9' ? 1920 : 1080
          const logicalH = aspectRatio === '16:9' ? 1080 : 1920
          const xScale = width / logicalW
          const yScale = height / logicalH

          const drawX = (activeClip.x ?? 0) * xScale
          const drawY = (activeClip.y ?? 0) * yScale
          const drawWidth = (activeClip.width ?? logicalW) * xScale
          const drawHeight = (activeClip.height ?? logicalH) * yScale

          const cropSx = activeClip.cropSx ?? 0
          const cropSy = activeClip.cropSy ?? 0
          const cropSw = activeClip.cropSw ?? 1
          const cropSh = activeClip.cropSh ?? 1

          const vDuration = activeClip.duration ?? 0
          const vElapsed = currentTime - activeClip.timestamp
          const vProgress = vDuration > 0 ? vElapsed / vDuration : 0

          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          applyZoomTransform(ctx, activeClip.zoom, vProgress, videoEl, drawX, drawY, drawWidth, drawHeight, cropSx, cropSy, cropSw, cropSh, activeClip.zoomIntensity, vElapsed)

          drawFrameToCanvas(currentTime, false)
          applyActiveEffect(currentTime)
        } else {
          shouldAdvance = false // Wait for video
        }
      } else {
        // Image or empty space
        if (isFirstFrame) {
          isFirstFrame = false
          mediaRecorder.start(100)
          startAudio()
        }

        if (activeClipId) {
          if (activeVideoEl && !activeVideoEl.paused) activeVideoEl.pause()
          if (audioSources.has(activeClipId)) {
            try { audioSources.get(activeClipId)!.disconnect(audioDestination) } catch {}
          }
          activeClipId = null
          activeVideoEl = null
        }

        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)
        drawFrameToCanvas(currentTime, true)
        applyActiveEffect(currentTime)
      }

      if (shouldAdvance) {
        currentTime += delta
        
        // Pre-seek next clip if we're near the end of current one
        const nextClip = mainVideos.find(v => v.timestamp > currentTime && v.timestamp < currentTime + 2)
        if (nextClip) {
          const nextVid = videoElements.get(nextClip.id)
          if (nextVid && nextVid.readyState < 2) {
            const nextTrimStart = nextClip.trimStart ?? 0
            if (Math.abs(nextVid.currentTime - nextTrimStart) > 0.1) {
              nextVid.currentTime = nextTrimStart
            }
          }
        }

        const progress = 15 + (currentTime / totalDuration) * 80
        onProgress?.({ phase: 'rendering', progress: Math.min(95, progress), message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` })
      }

      animationId = requestAnimationFrame(renderFrame)
    }

    animationId = requestAnimationFrame(renderFrame)
  })
} catch (err) {
    ffmpegLock = false
    throw err
  }
}

export async function extractVideoClip(
  url: string,
  startTime: number,
  duration: number,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  while (ffmpegLock) {
    onProgress?.('Waiting for engine...')
    await new Promise(r => setTimeout(r, 500))
  }
  ffmpegLock = true

  try {
    onProgress?.('Initializing engine...')
    const ff = await getFFmpeg()
    
    // Clean up old files
    for (const f of ['input.mp4', 'output.mp4']) {
      try { await ff.deleteFile(f) } catch {}
    }

    onProgress?.('Loading source...')
    const inputData = await fetchFile(url)
    await ff.writeFile('input.mp4', inputData)

    onProgress?.('Slicing video clip...')
    
    // Use input seeking (-ss before -i) which is nearly instant for long files
    const cmd = [
      '-ss', startTime.toFixed(3),
      '-i', 'input.mp4',
      '-t', duration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-avoid_negative_ts', 'make_zero',
      'output.mp4'
    ]

    await ff.exec(cmd)

    onProgress?.('Finalizing...')
    const data = await ff.readFile('output.mp4')
    
    // Clean up
    try { await ff.deleteFile('input.mp4') } catch {}
    try { await ff.deleteFile('output.mp4') } catch {}

    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
  } finally {
    ffmpegLock = false
  }
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
