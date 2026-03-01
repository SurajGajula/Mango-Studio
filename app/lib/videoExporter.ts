import { VideoClass } from '@/app/models/VideoClass'
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

export async function exportVideo(
  videos: VideoClass[],
  aspectRatio: '16:9' | '9:16',
  onProgress?: ProgressCallback
): Promise<Blob> {
  const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp)
  const totalDuration = sortedVideos.reduce((sum, v) => sum + (v.duration || 0), 0)

  if (sortedVideos.length === 0 || totalDuration === 0) {
    throw new Error('No videos to export')
  }

  onProgress?.({ phase: 'preparing', progress: 0, message: 'Preparing video elements...' })

  // Determine canvas size based on aspect ratio (1080p equivalent)
  const width = aspectRatio === '16:9' ? 1920 : 1080
  const height = aspectRatio === '16:9' ? 1080 : 1920

  // Create offscreen canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Create video elements for each clip
  const videoElements: Map<string, HTMLVideoElement> = new Map()
  
  await Promise.all(sortedVideos.map((clip) => {
    return new Promise<void>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.playsInline = true
      video.muted = false
      video.src = clip.url || ''

      video.onloadeddata = () => {
        videoElements.set(clip.id, video)
        resolve()
      }
      video.onerror = () => reject(new Error(`Failed to load video: ${clip.title}`))
      video.load()
    })
  }))

  onProgress?.({ phase: 'preparing', progress: 10, message: 'Setting up recording...' })

  const audioContext = new AudioContext()
  await audioContext.resume()
  
  const audioDestination = audioContext.createMediaStreamDestination()
  const audioSources: Map<string, MediaElementAudioSourceNode> = new Map()

  videoElements.forEach((video, clipId) => {
    video.muted = false
    video.volume = 1
    const source = audioContext.createMediaElementSource(video)
    audioSources.set(clipId, source)
  })

  // Capture canvas stream
  const canvasStream = canvas.captureStream(60)
  
  // Combine video and audio tracks
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ])

  // Set up MediaRecorder with best quality
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm'

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 20_000_000, // 20 Mbps for high quality
  })

  const chunks: Blob[] = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  onProgress?.({ phase: 'rendering', progress: 15, message: 'Starting render...' })

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      onProgress?.({ phase: 'encoding', progress: 95, message: 'Finalizing WebM...' })
      
      videoElements.forEach((v) => {
        v.pause()
        v.src = ''
      })
      audioContext.close()

      const webmBlob = new Blob(chunks, { type: mimeType })
      
      onProgress?.({ phase: 'converting', progress: 96, message: 'Loading FFmpeg...' })
      
      try {
        const ff = await getFFmpeg()
        
        onProgress?.({ phase: 'converting', progress: 97, message: 'Converting to MP4...' })
        
        const webmData = await fetchFile(webmBlob)
        await ff.writeFile('input.webm', webmData)
        
        await ff.exec([
          '-i', 'input.webm',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          'output.mp4'
        ])
        
        const mp4Data = await ff.readFile('output.mp4')
        const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
        
        await ff.deleteFile('input.webm')
        await ff.deleteFile('output.mp4')
        
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

    mediaRecorder.start(100) // Collect data every 100ms

    let currentTime = 0
    let currentClipIndex = 0
    let currentVideo: HTMLVideoElement | null = null
    let currentAudioSource: MediaElementAudioSourceNode | null = null
    let animationId: number

    const startNextClip = () => {
      if (currentAudioSource) {
        try {
          currentAudioSource.disconnect(audioDestination)
        } catch {}
      }

      if (currentClipIndex >= sortedVideos.length) {
        cancelAnimationFrame(animationId)
        mediaRecorder.stop()
        return
      }

      const clip = sortedVideos[currentClipIndex]
      currentVideo = videoElements.get(clip.id) || null
      currentAudioSource = audioSources.get(clip.id) || null

      if (currentAudioSource) {
        currentAudioSource.connect(audioDestination)
      }

      if (currentVideo) {
        const trimStart = clip.trimStart ?? 0
        currentVideo.currentTime = trimStart
        currentVideo.play().catch(() => {})
      }
    }

    const renderFrame = () => {
      if (currentClipIndex >= sortedVideos.length) {
        return
      }

      const clip = sortedVideos[currentClipIndex]
      const video = currentVideo

      if (video && video.readyState >= 2) {
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)

        const videoAspect = video.videoWidth / video.videoHeight
        const canvasAspect = width / height
        let drawWidth = width
        let drawHeight = height
        let drawX = 0
        let drawY = 0

        if (videoAspect > canvasAspect) {
          drawHeight = width / videoAspect
          drawY = (height - drawHeight) / 2
        } else {
          drawWidth = height * videoAspect
          drawX = (width - drawWidth) / 2
        }

        ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight)

        const trimStart = clip.trimStart ?? 0
        const trimEnd = clip.trimEnd ?? 0
        const originalDuration = clip.originalDuration ?? clip.duration ?? 0
        const playbackEnd = originalDuration - trimEnd
        const localTimeInTrimmed = video.currentTime - trimStart

        currentTime = clip.timestamp + localTimeInTrimmed
        const progress = 15 + (currentTime / totalDuration) * 80
        onProgress?.({
          phase: 'rendering',
          progress: Math.min(95, progress),
          message: `Rendering... ${Math.round((currentTime / totalDuration) * 100)}%`,
        })

        if (video.ended || video.currentTime >= playbackEnd - 0.05) {
          video.pause()
          currentClipIndex++
          startNextClip()
        }
      }

      animationId = requestAnimationFrame(renderFrame)
    }

    // Start rendering
    startNextClip()
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
