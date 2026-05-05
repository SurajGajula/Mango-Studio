'use client'

import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { calculateSourceTime } from '@/app/lib/renderUtils'
import { syncSelectionToActivePlayingClip } from '@/app/lib/playbackSelectionSync'
import { VideoRenderingEngine, RenderState, RenderResources } from '@/app/lib/videoRenderingEngine'
import { setVideoCrossOriginForUrl } from '@/app/lib/mediaUtils'
import type { VideoClass } from '@/app/models/VideoClass'
import type { AudioClass } from '@/app/models/AudioClass'

function resolvedMediaHref(src: string): string {
  try {
    return new URL(src, window.location.href).href
  } catch {
    return src
  }
}

function videoElementSrcMatches(el: HTMLVideoElement, src: string): boolean {
  const current = el.currentSrc || el.src || ''
  return resolvedMediaHref(current) === resolvedMediaHref(src)
}

function audioElementSrcMatches(el: HTMLAudioElement, src: string): boolean {
  const current = el.currentSrc || el.src || ''
  return resolvedMediaHref(current) === resolvedMediaHref(src)
}

function audioDecodeLeadSeconds(_ctx: AudioContext): number {
  return 0
}

function clampAudioSeekTime(el: HTMLAudioElement, requestedTime: number): number {
  if (!Number.isFinite(requestedTime)) return 0
  const clampedMin = Math.max(0, requestedTime)
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0) return clampedMin
  // Avoid seeking to exact duration, which can keep the element in ended state.
  return Math.min(clampedMin, Math.max(0, duration - 0.001))
}

function resetAudioElementForLoop(el: HTMLAudioElement, restartAt: number) {
  if (!el.paused) el.pause()
  el.playbackRate = 1
  const t = clampAudioSeekTime(el, restartAt)
  el.currentTime = t
  if (el.ended) {
    el.currentTime = clampAudioSeekTime(el, restartAt)
  }
}

const AUDIO_PREFETCH_BEFORE_SEC = 35

function isAudioElementReady(el: HTMLAudioElement): boolean {
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
  if (el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) return false
  const duration = el.duration
  return !Number.isNaN(duration)
}

type PersistenceCanvasMap = Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>

function syncManifestVideoPool(
  playbackTime: number,
  videosList: VideoClass[],
  videoElementsRef: MutableRefObject<Map<string, HTMLVideoElement>>,
  persistenceCanvasesRef: MutableRefObject<PersistenceCanvasMap>
) {
  const sortedVideos = [...videosList].sort((a, b) => a.timestamp - b.timestamp)
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
    const clipSrc = clip.url || clip.sourceUrl
    const span = clip.duration ?? 0
    const clipEnd = clip.timestamp + span
    const inTimelineRange = playbackTime >= clip.timestamp && playbackTime < clipEnd
    const prefetchBeforeStart =
      playbackTime < clip.timestamp && clip.timestamp - playbackTime <= 10
    const isNearPlayhead = inTimelineRange || prefetchBeforeStart

    if (!video && clipSrc && isNearPlayhead) {
      const fullUrl = clipSrc.startsWith('http') ? clipSrc : window.location.origin + clipSrc
      video =
        removedElements.get(resolvedMediaHref(fullUrl)) ||
        removedElements.get(resolvedMediaHref(clipSrc)) ||
        removedElements.get(fullUrl) ||
        removedElements.get(clipSrc)

      if (video) {
        removedElements.delete(video.src)
        setVideoCrossOriginForUrl(video, clipSrc)
      } else {
        video = document.createElement('video')
        video.preload = 'auto'
        video.playsInline = true
        setVideoCrossOriginForUrl(video, clipSrc)
        video.src = clipSrc
        video.onloadedmetadata = () => {
          const currentClip = useManifestStore.getState().videos.find((v) => v.id === clip.id)
          if (!currentClip) return
          const hasTrim = currentClip.trimStart > 0 || currentClip.trimEnd > 0
          const cd = currentClip.duration
          const needsTimelineDuration = cd == null || !(cd > 0)
          if (!hasTrim && video!.duration && needsTimelineDuration) {
            useManifestStore.getState().updateVideo(clip.id, { duration: video!.duration })
          }
        }
      }
      videoElementsRef.current.set(clip.id, video)
    } else if (video && clipSrc && !videoElementSrcMatches(video, clipSrc) && isNearPlayhead) {
      video.pause()
      setVideoCrossOriginForUrl(video, clipSrc)
      video.src = clipSrc
      video.load()
    } else if (video && !isNearPlayhead) {
      const srcActive = (video.currentSrc || video.src || '').length > 0
      if (srcActive) {
        video.pause()
        video.src = ''
        video.load()
      }
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
}

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  hiddenTextId?: string | null,
  renderTextsInCanvas: boolean = true
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
  const audioWarmupUntilRef = useRef<Map<string, number>>(new Map())
  const audioPendingStartRef = useRef<Map<string, { syncTarget: number; effectiveVol: number; timestamp: number }>>(new Map())
  const audioCanPlayListenersRef = useRef<Map<string, () => void>>(new Map())
  const wasPlayingRef = useRef(false)
  const internalPlaybackTimeRef = useRef(0)
  const [contentRect, setContentRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const contentRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const audios = useManifestStore((state) => state.audios)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const effects = useManifestStore((state) => state.effects)

  const getState = useManifestStore.getState

  const disposePreviewAudio = useCallback((id: string) => {
    audioPlayPromisesRef.current.delete(id)
    audioPendingStartRef.current.delete(id)
    audioWarmupUntilRef.current.delete(id)
    const el = audioElementsRef.current.get(id)
    if (el) {
      const listener = audioCanPlayListenersRef.current.get(id)
      if (listener) {
        el.removeEventListener('canplay', listener)
        audioCanPlayListenersRef.current.delete(id)
      }
      el.pause()
      el.src = ''
      audioElementsRef.current.delete(id)
    } else {
      audioCanPlayListenersRef.current.delete(id)
    }
    const nodes = audioNodesRef.current.get(id)
    if (nodes) {
      try {
        nodes.source.disconnect()
        nodes.gain.disconnect()
      } catch {
      }
      audioNodesRef.current.delete(id)
    }
  }, [])

  const installPreviewAudio = useCallback(
    (audioItem: AudioClass) => {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const el = new Audio(audioItem.url)
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      el.load()
      const trimPrime = Math.max(0, audioItem.trimStart ?? 0)
      const primeSeekToTrim = () => {
        el.currentTime = clampAudioSeekTime(el, trimPrime)
      }
      if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
        primeSeekToTrim()
      } else {
        el.addEventListener('loadedmetadata', primeSeekToTrim, { once: true })
      }
      ;(el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = false
      ;(el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).webkitPreservesPitch = false
      audioElementsRef.current.set(audioItem.id, el)
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      gain.gain.value = audioItem.volume ?? 1.0
      source.connect(gain)
      gain.connect(ctx.destination)
      audioNodesRef.current.set(audioItem.id, { source, gain })
    },
    [getAudioCtx]
  )

  const rebuildAllPreviewAudios = useCallback(
    (items: AudioClass[]) => {
      items.forEach((item) => {
        disposePreviewAudio(item.id)
        installPreviewAudio(item)
      })
    },
    [disposePreviewAudio, installPreviewAudio]
  )

  useEffect(() => {
    syncManifestVideoPool(getState().playbackTime, videos, videoElementsRef, persistenceCanvasesRef)
  }, [videos, getState])

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
    const currentAudioIds = new Set(audios.map((a) => a.id))
    audioElementsRef.current.forEach((_, id) => {
      if (!currentAudioIds.has(id)) {
        disposePreviewAudio(id)
      }
    })

    audios.forEach((audioItem) => {
      const el = audioElementsRef.current.get(audioItem.id)
      if (!el) {
        installPreviewAudio(audioItem)
      } else if (!audioElementSrcMatches(el, audioItem.url)) {
        disposePreviewAudio(audioItem.id)
        installPreviewAudio(audioItem)
      }
    })
  }, [audios, disposePreviewAudio, installPreviewAudio])

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
      const ids = [...audioElementsRef.current.keys()]
      ids.forEach((id) => disposePreviewAudio(id))
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      audioPendingStartRef.current.clear()
      audioCanPlayListenersRef.current.clear()
    }
  }, [disposePreviewAudio])

  const computeContentRect = useCallback((cw: number, ch: number) => {
    const targetAspect = 9 / 16
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
  }, [])

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

  const previewLayoutRef = useRef({ cw: 0, ch: 0, cr: { x: 0, y: 0, width: 0, height: 0 } })

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const measure = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const cw = Math.round(rect.width)
      const ch = Math.round(rect.height)
      const cr = applyCanvasSizeRef.current(canvas, cw, ch)
      previewLayoutRef.current = { cw, ch, cr }
    }
    measure()
    const ro = new ResizeObserver(() => {
      measure()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let lastTimestamp: number | null = null

    const loop = (timestamp: number) => {
      const state = getState()
      const { isPlaying } = state

      const rate = state.playbackRate ?? 1
      const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0
      lastTimestamp = timestamp

      let newTime = 0
      let didWrapPlayback = false
      if (isPlaying) {
        internalPlaybackTimeRef.current += delta * rate
        newTime = internalPlaybackTimeRef.current

        const totalDur = state.getTotalDuration()
        if (newTime >= totalDur) {
          if (state.isLooping && totalDur > 0) {
            state.setPlaybackTime(0)
            internalPlaybackTimeRef.current = 0
            newTime = 0
            lastTimestamp = null
            didWrapPlayback = true
          } else {
            state.setIsPlaying(false)
            state.setPlaybackTime(0)
            internalPlaybackTimeRef.current = 0
            newTime = 0
            lastTimestamp = null
          }
        } else {
          state.setPlaybackTime(newTime)
        }
      } else {
        internalPlaybackTimeRef.current = state.playbackTime
        newTime = state.playbackTime
        lastTimestamp = null
      }

      syncSelectionToActivePlayingClip(newTime, state.videos, state.images, useSelectionStore.getState())

      syncManifestVideoPool(newTime, state.videos, videoElementsRef, persistenceCanvasesRef)

      const canvas = canvasRef.current; const container = containerRef.current
      
      const audioCtx = getAudioCtx()
      if (isPlaying && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {})
      }

      const decodeLead = state.audios.length > 0 ? audioDecodeLeadSeconds(audioCtx) : 0
      const audioDriftSeek = 0.055

      if (!isPlaying && wasPlayingRef.current) {
        audioPlayPromisesRef.current.clear()
        audioWarmupUntilRef.current.clear()
        audioPendingStartRef.current.clear()
        state.audios.forEach((audioItem) => {
          const el = audioElementsRef.current.get(audioItem.id)
          if (!el) return
          if (!el.paused) el.pause()
          const l = audioCanPlayListenersRef.current.get(audioItem.id)
          if (l) {
            el.removeEventListener('canplay', l)
            audioCanPlayListenersRef.current.delete(audioItem.id)
          }
        })
      }

      if (didWrapPlayback) {
        audioPlayPromisesRef.current.clear()
        audioWarmupUntilRef.current.clear()
        audioPendingStartRef.current.clear()
        rebuildAllPreviewAudios(state.audios)
      }

      const playbackJustStarted = isPlaying && !wasPlayingRef.current
      const replayFromTimelineStart =
        playbackJustStarted && !didWrapPlayback && newTime <= 0.05

      if (replayFromTimelineStart) {
        audioPlayPromisesRef.current.clear()
        audioWarmupUntilRef.current.clear()
        audioPendingStartRef.current.clear()
        rebuildAllPreviewAudios(state.audios)
      } else if (playbackJustStarted && !didWrapPlayback) {
        audioPlayPromisesRef.current.clear()
        audioWarmupUntilRef.current.clear()
        audioPendingStartRef.current.clear()
        state.audios.forEach((audioItem) => {
          const el = audioElementsRef.current.get(audioItem.id)
          if (!el) return
          const canPlayListener = audioCanPlayListenersRef.current.get(audioItem.id)
          if (canPlayListener) {
            el.removeEventListener('canplay', canPlayListener)
            audioCanPlayListenersRef.current.delete(audioItem.id)
          }
          const nodes = audioNodesRef.current.get(audioItem.id)
          if (nodes) {
            const gv = audioItem.volume ?? 1
            try {
              nodes.gain.gain.cancelScheduledValues(audioCtx.currentTime)
              nodes.gain.gain.setValueAtTime(gv, audioCtx.currentTime)
            } catch {
            }
          }
          const restartAt = Math.max(0, audioItem.trimStart ?? 0)
          const inside = newTime >= audioItem.startTime && newTime < audioItem.endTime
          if (!inside) {
            resetAudioElementForLoop(el, restartAt)
            return
          }
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
          const pitch = audioItem.pitch ?? 1
          const target = (audioItem.trimStart ?? 0) + sourceTimeOffset * pitch
          const syncTarget = target + decodeLead
          resetAudioElementForLoop(el, clampAudioSeekTime(el, syncTarget))
        })
      }

      state.audios.forEach((audioItem) => {
        const elPrefetch = audioElementsRef.current.get(audioItem.id)
        if (
          elPrefetch &&
          elPrefetch.paused &&
          !audioPlayPromisesRef.current.has(audioItem.id) &&
          newTime >= audioItem.startTime - AUDIO_PREFETCH_BEFORE_SEC &&
          newTime < audioItem.startTime &&
          newTime < audioItem.endTime &&
          elPrefetch.readyState >= HTMLMediaElement.HAVE_METADATA
        ) {
          const trimPrefetch = Math.max(0, audioItem.trimStart ?? 0)
          if (Math.abs(elPrefetch.currentTime - trimPrefetch) > 0.08) {
            elPrefetch.currentTime = clampAudioSeekTime(elPrefetch, trimPrefetch)
          }
        }
      })

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
          const pitch = audioItem.pitch ?? 1
          const target = (audioItem.trimStart ?? 0) + sourceTimeOffset * pitch
          const syncTarget = target + decodeLead
          const vol = audioItem.volume ?? 1.0
          const fadeOutDuration = Math.max(0, audioItem.fadeOutDuration ?? 0)
          const timeRemaining = Math.max(0, audioItem.endTime - newTime)
          const fadeOutGain =
            fadeOutDuration > 0 ? Math.min(1, Math.max(0, timeRemaining / fadeOutDuration)) : 1
          const effectiveVol = vol * fadeOutGain

          if (!isAudioElementReady(el)) {
            const isStalledWhilePlaying =
              !el.paused &&
              el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
              el.networkState !== HTMLMediaElement.NETWORK_LOADING
            if (el.networkState === HTMLMediaElement.NETWORK_EMPTY) {
              el.load()
            } else if (isStalledWhilePlaying) {
              el.pause()
              el.currentTime = clampAudioSeekTime(el, syncTarget)
            }
            if (!el.paused) {
              return
            }
            audioPendingStartRef.current.set(audioItem.id, {
              syncTarget: clampAudioSeekTime(el, syncTarget),
              effectiveVol,
              timestamp,
            })
            if (!audioCanPlayListenersRef.current.has(audioItem.id)) {
              const canPlayListener = () => {
                const pending = audioPendingStartRef.current.get(audioItem.id)
                if (!pending) return
                if (!isAudioElementReady(el) || !el.paused || audioPlayPromisesRef.current.has(audioItem.id)) return
                el.currentTime = clampAudioSeekTime(el, pending.syncTarget)
                nodes.gain.gain.setValueAtTime(0, audioCtx.currentTime)
                nodes.gain.gain.linearRampToValueAtTime(pending.effectiveVol, audioCtx.currentTime + 0.05)
                audioWarmupUntilRef.current.set(audioItem.id, pending.timestamp + 140)
                const p = el.play()
                audioPlayPromisesRef.current.set(audioItem.id, p)
                p.catch(() => {}).finally(() => {
                  audioPlayPromisesRef.current.delete(audioItem.id)
                })
              }
              el.addEventListener('canplay', canPlayListener)
              audioCanPlayListenersRef.current.set(audioItem.id, canPlayListener)
            }
            return
          }
          audioPendingStartRef.current.delete(audioItem.id)
          const readyListener = audioCanPlayListenersRef.current.get(audioItem.id)
          if (readyListener) {
            el.removeEventListener('canplay', readyListener)
            audioCanPlayListenersRef.current.delete(audioItem.id)
          }
          const warmupUntil = audioWarmupUntilRef.current.get(audioItem.id) ?? 0
          const isWarmingUp = timestamp < warmupUntil
          if (!isWarmingUp && Math.abs(nodes.gain.gain.value - effectiveVol) > 0.001) {
            nodes.gain.gain.setTargetAtTime(effectiveVol, audioCtx.currentTime, 0.01)
          }

          const x = elapsed / Math.max(0.1, timelineDuration)
          let f = x
          if (audioItem.speedEasing === 'ease') {
            f = 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3)
          }
          const instantaneousSpeed = (audioItem.speedStart ?? audioItem.playbackSpeed ?? 1) +
            f * ((audioItem.speedEnd ?? audioItem.playbackSpeed ?? 1) - (audioItem.speedStart ?? audioItem.playbackSpeed ?? 1))

          const targetRate = rate * instantaneousSpeed * pitch
          if (Math.abs(el.playbackRate - targetRate) > 0.01) {
            el.playbackRate = targetRate
          }

          const drift = Math.abs(el.currentTime - syncTarget)
          if (!isWarmingUp && drift > audioDriftSeek) {
            el.currentTime = clampAudioSeekTime(el, syncTarget)
          }

          if (el.paused && !audioPlayPromisesRef.current.has(audioItem.id)) {
            el.currentTime = clampAudioSeekTime(el, syncTarget)
            nodes.gain.gain.setValueAtTime(0, audioCtx.currentTime)
            nodes.gain.gain.linearRampToValueAtTime(effectiveVol, audioCtx.currentTime + 0.05)
            audioWarmupUntilRef.current.set(audioItem.id, timestamp + 140)
            const p = el.play()
            audioPlayPromisesRef.current.set(audioItem.id, p)
            p.catch(() => {}).finally(() => {
              audioPlayPromisesRef.current.delete(audioItem.id)
            })
          }
        } else {
          audioPendingStartRef.current.delete(audioItem.id)
          audioWarmupUntilRef.current.delete(audioItem.id)
          if (!el.paused) {
            el.pause()
          }

          if (isInside) {
            if (!isAudioElementReady(el)) {
              return
            }
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
            const pitch = audioItem.pitch ?? 1
            const target = (audioItem.trimStart ?? 0) + sourceTimeOffset * pitch
            const syncTarget = target + decodeLead
            if (Math.abs(el.currentTime - syncTarget) > 0.04) {
              el.currentTime = clampAudioSeekTime(el, syncTarget)
            }
          }
        }
      })
      
      if (canvas && container) {
        let { cw, ch, cr } = previewLayoutRef.current
        if (cw === 0) {
          const rect = container.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            cw = Math.round(rect.width)
            ch = Math.round(rect.height)
            cr = applyCanvasSizeRef.current(canvas, cw, ch)
            previewLayoutRef.current = { cw, ch, cr }
          }
        }

        if (cw > 0) {
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
            videos: state.videos,
            images: state.images,
            texts: renderTextsInCanvas
              ? (hiddenTextId ? state.texts.filter((text) => text.id !== hiddenTextId) : state.texts)
              : [],
            effects: state.effects
          }

          const resources: RenderResources = {
            videoElements: videoElementsRef.current,
            imageBitmaps: imageBitmapsRef.current,
            bufferCanvas: bufferCanvasRef.current,
            persistenceCanvases: persistenceCanvasesRef.current
          }

          engineRef.current?.render(
            canvas,
            cr,
            renderState,
            resources,
            (_id: string, _time: number) => {},
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
            }
          )
        }
      }
      wasPlayingRef.current = isPlaying
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getState, canvasRef, containerRef, getAudioCtx, hiddenTextId, renderTextsInCanvas, rebuildAllPreviewAudios])

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
