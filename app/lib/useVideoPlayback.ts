'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { getSortedMainItems, findActiveAndNextItems, checkTransition, calculateSourceTime } from '@/app/lib/renderUtils'
import { VideoRenderingEngine, RenderState, RenderResources } from '@/app/lib/videoRenderingEngine'

function audioDecodeLeadSeconds(ctx: AudioContext): number {
  let lead = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0
  const ol = (ctx as AudioContext & { outputLatency?: number }).outputLatency
  if (typeof ol === 'number' && Number.isFinite(ol)) lead += ol
  return Math.min(0.12, Math.max(0, lead))
}

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const engineRef = useRef<VideoRenderingEngine | null>(null)
  if (!engineRef.current) engineRef.current = new VideoRenderingEngine()

  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageBitmapsRef = useRef<Map<string, ImageBitmap>>(new Map())
  const imageUrlsRef = useRef<Map<string, string>>(new Map())
  const urlCacheRef = useRef<Map<string, ImageBitmap>>(new Map())
  const loadingUrlsRef = useRef<Set<string>>(new Set())
  const persistenceCanvasesRef = useRef<Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>>(new Map())
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioNodesRef = useRef<Map<string, { source: MediaElementAudioSourceNode; gain: GainNode }>>(new Map())
  const rafRef = useRef<number | null>(null)
  
  // Initialize AudioContext lazily but reliably
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioCtxRef.current
  }, [])

  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoPlayPromisesRef = useRef<Map<string, Promise<void>>>(new Map())
  const audioPlayPromisesRef = useRef<Map<string, Promise<void>>>(new Map())
  const internalPlaybackTimeRef = useRef(0)
  const [contentRect, setContentRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const contentRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const audios = useManifestStore((state) => state.audios)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)
  const effects = useManifestStore((state) => state.effects)

  const getState = useManifestStore.getState
  const getSelectionState = useSelectionStore.getState

  useEffect(() => {
    const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp)
    const currentIds = new Set(sortedVideos.map((v) => v.id))

    const removedElements = new Map<string, HTMLVideoElement>()
    videoElementsRef.current.forEach((el, id) => {
      if (!currentIds.has(id)) {
        removedElements.set(el.src, el)
        videoElementsRef.current.delete(id)
        persistenceCanvasesRef.current.delete(id)
      }
    })

    sortedVideos.forEach((clip) => {
      let video = videoElementsRef.current.get(clip.id)
      const isNearPlayhead = Math.abs(clip.timestamp - playbackTime) < 10 || 
                             (playbackTime >= clip.timestamp && playbackTime < clip.timestamp + (clip.duration ?? 0))

      if (!video && clip.url && isNearPlayhead) {
        const fullUrl = clip.url.startsWith('http') ? clip.url : window.location.origin + clip.url
        video = removedElements.get(fullUrl) || removedElements.get(clip.url)
        
        if (video) {
          removedElements.delete(video.src)
        } else {
          video = document.createElement('video')
          video.preload = 'auto'
          video.playsInline = true
          video.src = clip.url
          video.onloadedmetadata = () => {
            const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
            if (!currentClip) return
            const hasTrim = currentClip.trimStart > 0 || currentClip.trimEnd > 0
            if (!hasTrim && video!.duration && (!currentClip.duration || Math.abs(currentClip.duration - video!.duration) > 0.1)) {
              useManifestStore.getState().updateVideo(clip.id, { duration: video!.duration })
            }
          }
        }
        videoElementsRef.current.set(clip.id, video)
      } else if (video && clip.url && video.src !== clip.url && isNearPlayhead) {
        video.pause()
        video.src = clip.url
        video.load()
      } else if (video && !isNearPlayhead) {
        video.pause()
        video.src = ''
        video.load()
        videoElementsRef.current.delete(clip.id)
        persistenceCanvasesRef.current.delete(clip.id)
        video = undefined
      }

      if (video && video.muted !== clip.muted) {
        video.muted = clip.muted
      }
    })

    removedElements.forEach((el) => {
      el.pause()
      el.src = ''
      el.load()
    })
  }, [videos, Math.floor(playbackTime / 5)])

  useEffect(() => {
    const currentIds = new Set(images.map((o) => o.id))

    imageBitmapsRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        imageBitmapsRef.current.delete(id)
        imageUrlsRef.current.delete(id)
      }
    })

    if (urlCacheRef.current.size > 200) {
      const activeUrls = new Set(images.map(img => img.url))
      urlCacheRef.current.forEach((bitmap, url) => {
        if (!activeUrls.has(url)) {
          bitmap.close()
          urlCacheRef.current.delete(url)
        }
      })
    }

    images.forEach(async (image) => {
      const isNearPlayhead = Math.abs(image.startTime - playbackTime) < 60 || 
                             (playbackTime >= image.startTime && playbackTime < image.endTime)

      if (!isNearPlayhead) return

      // Invalidate per-id cache if the URL has changed (image replacement)
      if (imageUrlsRef.current.get(image.id) !== image.url) {
        imageBitmapsRef.current.delete(image.id)
        imageUrlsRef.current.set(image.id, image.url)
      }

      let bitmap = imageBitmapsRef.current.get(image.id)
      if (!bitmap) {
        bitmap = urlCacheRef.current.get(image.url)
        if (!bitmap) {
          if (loadingUrlsRef.current.has(image.url)) return
          loadingUrlsRef.current.add(image.url)
          try {
            const response = await fetch(image.url)
            const blob = await response.blob()
            const newBitmap = await createImageBitmap(blob)
            urlCacheRef.current.set(image.url, newBitmap)
            imageBitmapsRef.current.set(image.id, newBitmap)
          } catch (e) {
            console.error('Failed to load image bitmap', image.url, e)
          } finally {
            loadingUrlsRef.current.delete(image.url)
          }
        } else {
          imageBitmapsRef.current.set(image.id, bitmap)
        }
      }
    })
  }, [images, Math.floor(playbackTime * 4)])

  useEffect(() => {
    const currentAudioIds = new Set(audios.map(a => a.id))
    audioElementsRef.current.forEach((el, id) => {
      if (!currentAudioIds.has(id)) {
        el.pause()
        el.src = ''
        audioElementsRef.current.delete(id)
        audioPlayPromisesRef.current.delete(id)
        const nodes = audioNodesRef.current.get(id)
        if (nodes) {
          try {
            nodes.source.disconnect()
            nodes.gain.disconnect()
          } catch (e) {}
          audioNodesRef.current.delete(id)
        }
      }
    })

    audios.forEach(audioItem => {
      let el = audioElementsRef.current.get(audioItem.id)
      if (!el) {
        el = new Audio(audioItem.url)
        el.preload = 'auto'
        el.crossOrigin = 'anonymous'
        audioElementsRef.current.set(audioItem.id, el)

        // Setup Web Audio for volume > 100%
        const ctx = getAudioCtx()
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        const source = ctx.createMediaElementSource(el)
        const gain = ctx.createGain()
        
        // Use immediate values for initialization to avoid issues with suspended context
        gain.gain.value = audioItem.volume ?? 1.0
        
        source.connect(gain)
        gain.connect(ctx.destination)
        audioNodesRef.current.set(audioItem.id, { source, gain })
      } else if (el.src !== audioItem.url) {
        el.pause()
        el.src = audioItem.url
        el.load()
      }
    })
  }, [audios])

  // Resume audio context on user interaction to satisfy browser policies
  useEffect(() => {
    const resume = () => {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    }
    window.addEventListener('mousedown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('mousedown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [getAudioCtx])

  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach(el => {
        el.pause()
        el.src = ''
      })
      audioElementsRef.current.clear()
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      audioNodesRef.current.clear()
    }
  }, [])

  const computeContentRect = useCallback((cw: number, ch: number) => {
    const targetAspect = aspectRatio === '16:9' ? 16 / 9 : 9 / 16
    const canvasAspect = cw / ch
    let x: number, y: number, width: number, height: number
    if (Math.abs(canvasAspect - targetAspect) < 0.001) {
      x = 0; y = 0; width = cw; height = ch
    } else if (canvasAspect > targetAspect) {
      height = ch
      width = Math.round(ch * targetAspect)
      x = Math.round((cw - width) / 2)
      y = 0
    } else {
      width = cw
      height = Math.round(cw / targetAspect)
      x = 0
      y = Math.round((ch - height) / 2)
    }
    return { x, y, width, height }
  }, [aspectRatio])

  const applyCanvasSize = useCallback((canvas: HTMLCanvasElement, cw: number, ch: number) => {
    // Only resize if the difference is more than 2 pixels to avoid jitter
    if (Math.abs(canvas.width - cw) > 2 || Math.abs(canvas.height - ch) > 2) {
      canvas.width = cw; canvas.height = ch
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`
      
      // Keep buffer canvas in sync
      if (!bufferCanvasRef.current) bufferCanvasRef.current = document.createElement('canvas')
      const buffer = bufferCanvasRef.current
      buffer.width = cw
      buffer.height = ch

      // IMPORTANT: Changing canvas dimensions clears it to transparent.
      // We must immediately restore the visible canvas from the buffer 
      // so it doesn't flash black for a frame.
      const ctx = canvas.getContext('2d', { alpha: false })
      if (ctx && buffer.width > 0) {
        ctx.drawImage(buffer, 0, 0)
      }
    }
    const cr = computeContentRect(cw, ch)
    const prev = contentRectRef.current
    if (Math.abs(cr.x - prev.x) > 1 || Math.abs(cr.y - prev.y) > 1 || Math.abs(cr.width - prev.width) > 1 || Math.abs(cr.height - prev.height) > 1) {
      contentRectRef.current = cr
      setContentRect(cr)
    }
    return cr
  }, [computeContentRect])

  const applyCanvasSizeRef = useRef(applyCanvasSize)
  applyCanvasSizeRef.current = applyCanvasSize

  useEffect(() => {
    let lastTimestamp: number | null = null
    let lastRectUpdate = 0
    let currentCW = 0
    let currentCH = 0
    let currentCR = { x: 0, y: 0, width: 0, height: 0 }

    const loop = (timestamp: number) => {
      const state = getState()
      const { isPlaying } = state

      const rate = state.playbackRate ?? 1
      const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0
      lastTimestamp = timestamp

      let newTime = 0
      if (isPlaying) {
        internalPlaybackTimeRef.current += delta * rate
        newTime = internalPlaybackTimeRef.current

        const totalDur = state.getTotalDuration()
        if (newTime >= totalDur) {
          state.setIsPlaying(false)
          state.setPlaybackTime(0)
          internalPlaybackTimeRef.current = 0
          newTime = 0
          lastTimestamp = null
        } else {
          state.setPlaybackTime(newTime)
        }
      } else {
        internalPlaybackTimeRef.current = state.playbackTime
        newTime = state.playbackTime
        lastTimestamp = null
      }

      const sorted = getSortedMainItems(state.videos, state.images)
      const { activeItem: activeClip, nextItem: nextClip } = findActiveAndNextItems(sorted, newTime)
      const { transitionActive, progress: transProgress } = checkTransition(activeClip, nextClip, newTime)

      const canvas = canvasRef.current; const container = containerRef.current
      
      const decodeLead = state.audios.length > 0 ? audioDecodeLeadSeconds(getAudioCtx()) : 0
      const audioDriftSeek = 0.055

      state.audios.forEach((audioItem) => {
        const el = audioElementsRef.current.get(audioItem.id)
        const nodes = audioNodesRef.current.get(audioItem.id)
        if (!el || !nodes) return

        const isInside = newTime >= audioItem.startTime && newTime < audioItem.endTime

        if (isInside && isPlaying) {
          const elapsed = newTime - audioItem.startTime
          const timelineDuration = audioItem.endTime - audioItem.startTime
          const sourceTimeOffset = calculateSourceTime(
            elapsed,
            timelineDuration,
            audioItem.speedStart ?? audioItem.playbackSpeed ?? 1,
            audioItem.speedEnd ?? audioItem.playbackSpeed ?? 1,
            audioItem.playbackSpeed ?? 1,
            audioItem.speedEasing ?? 'linear'
          )

          const target = (audioItem.trimStart ?? 0) + sourceTimeOffset
          const syncTarget = target + decodeLead

          const vol = audioItem.volume ?? 1.0
          if (Math.abs(nodes.gain.gain.value - vol) > 0.001) {
            nodes.gain.gain.setTargetAtTime(vol, getAudioCtx().currentTime, 0.01)
          }

          const x = elapsed / Math.max(0.1, timelineDuration)
          let f = x
          if (audioItem.speedEasing === 'ease') {
            f = 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3)
          }
          const instantaneousSpeed = (audioItem.speedStart ?? audioItem.playbackSpeed ?? 1) +
            f * ((audioItem.speedEnd ?? audioItem.playbackSpeed ?? 1) - (audioItem.speedStart ?? audioItem.playbackSpeed ?? 1))

          const targetRate = rate * instantaneousSpeed
          if (Math.abs(el.playbackRate - targetRate) > 0.01) {
            el.playbackRate = targetRate
          }

          const drift = Math.abs(el.currentTime - syncTarget)
          if (drift > audioDriftSeek) {
            el.currentTime = syncTarget
          }

          if (el.paused && !audioPlayPromisesRef.current.has(audioItem.id)) {
            el.currentTime = syncTarget
            const p = el.play()
            audioPlayPromisesRef.current.set(audioItem.id, p)
            p.catch(() => {}).finally(() => {
              audioPlayPromisesRef.current.delete(audioItem.id)
            })
          }
        } else {
          if (!el.paused) {
            el.pause()
          }

          if (isInside) {
            const elapsed = newTime - audioItem.startTime
            const timelineDuration = audioItem.endTime - audioItem.startTime
            const sourceTimeOffset = calculateSourceTime(
              elapsed,
              timelineDuration,
              audioItem.speedStart ?? audioItem.playbackSpeed ?? 1,
              audioItem.speedEnd ?? audioItem.playbackSpeed ?? 1,
              audioItem.playbackSpeed ?? 1,
              audioItem.speedEasing ?? 'linear'
            )
            const target = (audioItem.trimStart ?? 0) + sourceTimeOffset
            const syncTarget = target + decodeLead
            if (Math.abs(el.currentTime - syncTarget) > 0.04) {
              el.currentTime = syncTarget
            }
          }
        }
      })
      
      if (canvas && container) {
        // Optimization: Only update layout dimensions every 500ms or on first run
        // This avoids expensive getBoundingClientRect calls every frame
        if (timestamp - lastRectUpdate > 500 || currentCW === 0) {
          const rect = container.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            currentCW = Math.round(rect.width)
            currentCH = Math.round(rect.height)
            currentCR = applyCanvasSizeRef.current(canvas, currentCW, currentCH)
            lastRectUpdate = timestamp
          }
        }

        if (currentCW > 0) {
          if (!bufferCanvasRef.current) bufferCanvasRef.current = document.createElement('canvas')
          const bufferCanvas = bufferCanvasRef.current
          if (bufferCanvas.width !== canvas.width || bufferCanvas.height !== canvas.height) {
            bufferCanvas.width = canvas.width
            bufferCanvas.height = canvas.height
          }

          const renderState: RenderState = {
            playbackTime: newTime,
            isPlaying,
            playbackRate: rate,
            aspectRatio: state.aspectRatio,
            videos: state.videos,
            images: state.images,
            effects: state.effects,
            selectedVideoId: getSelectionState().selectedVideoId
          }

          const resources: RenderResources = {
            videoElements: videoElementsRef.current,
            imageBitmaps: imageBitmapsRef.current,
            bufferCanvas: bufferCanvasRef.current,
            persistenceCanvases: persistenceCanvasesRef.current
          }

          engineRef.current?.render(
            canvas,
            currentCR,
            renderState,
            resources,
            sorted,
            activeClip,
            nextClip,
            transitionActive,
            transProgress,
            (id, time) => {
              const el = videoElementsRef.current.get(id)
              if (el) el.currentTime = time
            },
             (id, playing, pRate) => {
               const el = videoElementsRef.current.get(id)
               if (!el) return
               
              if (playing) {
                if (Math.abs(el.playbackRate - pRate) > 0.005) {
                  el.playbackRate = pRate
                }
                
                if (el.paused && el.readyState >= 2 && !videoPlayPromisesRef.current.has(id)) {
                  const p = el.play()
                  videoPlayPromisesRef.current.set(id, p)
                  p.catch(() => {}).finally(() => { videoPlayPromisesRef.current.delete(id) })
                }
              } else {
                if (!el.paused) {
                  const p = videoPlayPromisesRef.current.get(id)
                  if (p) p.then(() => { el.pause(); el.playbackRate = 1 }).catch(() => {})
                  else { el.pause(); el.playbackRate = 1 }
                }
              }
            },
            (id) => {
              if (getSelectionState().selectedVideoId !== id) getSelectionState().setSelectedVideoId(id)
            }
          )
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getState, getSelectionState, canvasRef, containerRef, getAudioCtx])

  useEffect(() => { return () => { 
    videoElementsRef.current.forEach((video) => { 
      video.pause(); video.src = ''; video.load();
    }); 
    videoElementsRef.current.clear();
    imageBitmapsRef.current.forEach((bitmap) => bitmap.close())
    imageBitmapsRef.current.clear()
    urlCacheRef.current.forEach((bitmap) => bitmap.close())
    urlCacheRef.current.clear()
    persistenceCanvasesRef.current.clear();
  } }, [])
  return { contentRect }
}
