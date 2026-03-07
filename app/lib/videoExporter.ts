import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

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
    
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
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

interface ImageOnlyExportParams {
  images: ImageClass[]
  imageElements: Map<string, HTMLImageElement>
  overlayVideos: VideoClass[]
  videoElements: Map<string, HTMLVideoElement>
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  totalDuration: number
  audioUrl: string | null
  drawFrameToCanvas: (t: number) => void
  onProgress?: ProgressCallback
}

async function exportImageOnlyWithFFmpeg({
  images,
  canvas,
  totalDuration,
  audioUrl,
  drawFrameToCanvas,
  onProgress,
}: ImageOnlyExportParams): Promise<Blob> {
  onProgress?.({ phase: 'rendering', progress: 15, message: 'Rendering frames...' })

  const ff = await getFFmpeg()
  for (const f of ['output.mp4']) {
    try { await ff.deleteFile(f) } catch {}
  }

  const breaks = new Set<number>([0])
  images.forEach((img) => { breaks.add(img.startTime); breaks.add(img.endTime) })
  breaks.add(totalDuration)
  const sortedBreaks = [...breaks].filter((t) => t >= 0 && t <= totalDuration).sort((a, b) => a - b)

  const segments: Array<{ name: string; duration: number }> = []
  let frameIdx = 0

  for (let i = 0; i < sortedBreaks.length - 1; i++) {
    const t = sortedBreaks[i]
    const dur = sortedBreaks[i + 1] - t
    if (dur <= 0) continue

    drawFrameToCanvas(t + Math.min(0.001, dur * 0.01))

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) continue

    const name = `eif${frameIdx++}.png`
    await ff.writeFile(name, await fetchFile(blob))
    segments.push({ name, duration: dur })

    onProgress?.({
      phase: 'rendering',
      progress: 15 + ((i + 1) / (sortedBreaks.length - 1)) * 60,
      message: `Rendering frame ${i + 1}/${sortedBreaks.length - 1}...`,
    })
  }

  if (segments.length === 0) throw new Error('No frames to render')

  onProgress?.({ phase: 'converting', progress: 75, message: 'Encoding video...' })

  // Write ffconcat manifest — avoids per-input arg limits for large segment counts
  const concatLines = ['ffconcat version 1.0']
  for (const seg of segments) {
    concatLines.push(`file ${seg.name}`)
    concatLines.push(`duration ${seg.duration}`)
  }
  const concatText = new TextEncoder().encode(concatLines.join('\n'))
  try { await ff.deleteFile('concat.txt') } catch {}
  await ff.writeFile('concat.txt', concatText)

  if (audioUrl) {
    try { await ff.deleteFile('bgaudio.mp3') } catch {}
    const audioData = await fetchFile(audioUrl)
    await ff.writeFile('bgaudio.mp3', audioData)
  }

  const args: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
  ]

  if (audioUrl) args.push('-i', 'bgaudio.mp3')

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  )

  if (audioUrl) {
    args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-shortest')
  } else {
    args.push('-an')
  }

  args.push('output.mp4')

  await ff.exec(args)

  for (const { name } of segments) {
    try { await ff.deleteFile(name) } catch {}
  }
  try { await ff.deleteFile('concat.txt') } catch {}
  if (audioUrl) {
    try { await ff.deleteFile('bgaudio.mp3') } catch {}
  }

  const mp4Data = await ff.readFile('output.mp4') as Uint8Array
  const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' })
  try { await ff.deleteFile('output.mp4') } catch {}

  onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' })
  return mp4Blob
}

export async function exportVideo(
  videos: VideoClass[],
  aspectRatio: '16:9' | '9:16',
  onProgress?: ProgressCallback,
  images?: ImageClass[],
  audioUrl?: string | null
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
          ctx.save()
          ctx.globalAlpha = image.opacity
          ctx.drawImage(img, image.x * xScale, image.y * yScale, image.width * xScale, image.height * yScale)
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
        ctx.save()
        ctx.globalAlpha = video.opacity
        ctx.drawImage(videoEl, video.x * xScale, video.y * yScale, video.width * xScale, video.height * yScale)
        ctx.restore()
      })
  }

  if (mainVideos.length === 0) {
    return exportImageOnlyWithFFmpeg({
      images: images || [],
      imageElements,
      overlayVideos,
      videoElements,
      canvas,
      ctx,
      width,
      height,
      totalDuration,
      audioUrl: audioUrl ?? null,
      drawFrameToCanvas,
      onProgress,
    })
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

  const canvasStream = canvas.captureStream(60)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ])

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm'

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 20_000_000,
  })

  const chunks: Blob[] = []
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })


  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })

      videoElements.forEach((v) => { v.pause(); v.src = '' })
      if (bgAudioElement) { bgAudioElement.pause(); bgAudioElement.src = '' }
      audioContext.close()

      const webmBlob = new Blob(chunks, { type: mimeType })
      onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })

      try {
        const ff = await getFFmpeg()
        onProgress?.({ phase: 'converting', progress: 97, message: 'Converting to MP4...' })

        for (const f of ['input.webm', 'output.mp4']) {
          try { await ff.deleteFile(f) } catch {}
        }

        if (chunks.length === 0 || webmBlob.size === 0) {
          throw new Error('No recorded data')
        }

        const webmData = await fetchFile(webmBlob)
        await ff.writeFile('input.webm', webmData)

        const hasAudio = audioUrl != null || mainVideos.length > 0
        await ff.exec([
          '-y',
          '-i', 'input.webm',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
          '-movflags', '+faststart',
          'output.mp4',
        ])

        const mp4Data = await ff.readFile('output.mp4')
        const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })

        for (const f of ['input.webm', 'output.mp4']) {
          try { await ff.deleteFile(f) } catch {}
        }

        onProgress?.({ phase: 'complete', progress: 100, message: 'Export complete!' })
        resolve(mp4Blob)
      } catch (err) {
        console.error('FFmpeg conversion failed:', err)
        onProgress?.({ phase: 'error', progress: 0, message: 'MP4 conversion failed, using WebM' })
        resolve(webmBlob)
      }
    }

    mediaRecorder.onerror = (e) => {
      onProgress?.({ phase: 'error', progress: 0, message: 'Export failed' })
      reject(e)
    }

    mediaRecorder.start(100)

    let currentTime = 0
    let lastRafTimestamp: number | null = null
    let activeClipId: string | null = null
    let activeVideoEl: HTMLVideoElement | null = null
    let animationId: number

    const renderFrame = (rafTimestamp: number) => {
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

        if (lastRafTimestamp !== null) {
          currentTime = Math.min(currentTime + (rafTimestamp - lastRafTimestamp) / 1000, totalDuration)
        }
        lastRafTimestamp = rafTimestamp

        drawFrameToCanvas(currentTime)

        const progress = 15 + (currentTime / totalDuration) * 80
        onProgress?.({ phase: 'rendering', progress: Math.min(95, progress), message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%` })
      }

      animationId = requestAnimationFrame(renderFrame)
    }

    if (bgAudioElement) {
      bgAudioElement.currentTime = 0
      bgAudioElement.play().catch(() => {})
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
