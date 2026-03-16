'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { getSortedMainItems, findActiveAndNextItems, checkTransition } from '@/app/lib/renderUtils'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'

export function useVideoPlayback(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const urlCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const videoPlayPromisesRef = useRef<Map<string, Promise<void>>>(new Map())
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null)
  const [contentRect, setContentRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const contentRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)
  const playbackTime = useManifestStore((state) => state.playbackTime)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)

  const audioUrl = useAudioStore((state) => state.audioUrl)
  const getState = useManifestStore.getState
  const getSelectionState = useSelectionStore.getState

  useEffect(() => {
    const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp)
    const currentIds = new Set(sortedVideos.map((v) => v.id))

    videoElementsRef.current.forEach((el, id) => {
      if (!currentIds.has(id)) {
        el.pause()
        el.src = ''
        el.load()
        videoElementsRef.current.delete(id)
      }
    })

    sortedVideos.forEach((clip) => {
      let video = videoElementsRef.current.get(clip.id)
      const isNearPlayhead = Math.abs(clip.timestamp - playbackTime) < 10 || 
                             (playbackTime >= clip.timestamp && playbackTime < clip.timestamp + (clip.duration ?? 0))

      if (!video && clip.url && isNearPlayhead) {
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
        video = undefined
      }

      if (video && video.muted !== clip.muted) {
        video.muted = clip.muted
      }
    })
  }, [videos, Math.floor(playbackTime / 2)])

  useEffect(() => {
    const currentIds = new Set(images.map((o) => o.id))

    imageElementsRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        imageElementsRef.current.delete(id)
      }
    })

    if (urlCacheRef.current.size > 200) {
      const activeUrls = new Set(images.map(img => img.url))
      urlCacheRef.current.forEach((_, url) => {
        if (!activeUrls.has(url)) urlCacheRef.current.delete(url)
      })
    }

    images.forEach((image) => {
      const isNearPlayhead = Math.abs(image.startTime - playbackTime) < 60 || 
                             (playbackTime >= image.startTime && playbackTime < image.endTime)

      if (!isNearPlayhead) return

      let img = imageElementsRef.current.get(image.id)
      if (!img || img.getAttribute('data-url') !== image.url) {
        img = urlCacheRef.current.get(image.url)
        if (!img) {
          img = new Image()
          img.src = image.url
          img.setAttribute('data-url', image.url)
          img.decode().catch(() => {})
          urlCacheRef.current.set(image.url, img)
        }
        imageElementsRef.current.set(image.id, img)
      }
    })
  }, [images, Math.floor(playbackTime)])

  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
      audioElementRef.current = null
    }
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audio.preload = 'auto'
    audioElementRef.current = audio
  }, [audioUrl])

  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
        audioElementRef.current = null
      }
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
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`
    }
    const cr = computeContentRect(cw, ch)
    const prev = contentRectRef.current
    if (cr.x !== prev.x || cr.y !== prev.y || cr.width !== prev.width || cr.height !== prev.height) {
      contentRectRef.current = cr
      setContentRect(cr)
    }
    return cr
  }, [computeContentRect])

  const drawVideoToCanvas = useCallback((videoEl: HTMLVideoElement, videoClip: VideoClass, currentTime: number): { x: number; y: number; width: number; height: number } | null => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return null

    if (videoEl.readyState < 2 || videoEl.seeking || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const rect = container.getBoundingClientRect()
    const cw = Math.round(rect.width); const ch = Math.round(rect.height)
    const cr = applyCanvasSize(canvas, cw, ch)

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH

    const drawX = cr.x + (videoClip.x ?? 0) * xScale
    const drawY = cr.y + (videoClip.y ?? 0) * yScale
    const drawWidth = (videoClip.width ?? logicalW) * xScale
    const drawHeight = (videoClip.height ?? logicalH) * yScale

    const isSplit = videoClip.zoom === 'split-horizontal' || videoClip.zoom === 'split-vertical'
    let progress = 0
    if (isSplit) {
      progress = 1
    } else if (videoClip.zoom === 'in' || videoClip.zoom === 'out') {
      const transDur = Math.max(0.1, videoClip.transitionDuration ?? 1.0)
      const elapsed = currentTime - videoClip.timestamp
      progress = Math.max(0, Math.min(1, elapsed / transDur))
    } else {
      progress = videoClip.duration && videoClip.duration > 0 ? (currentTime - videoClip.timestamp) / videoClip.duration : 0
    }

    applyZoomTransform(ctx, videoClip.zoom, progress, videoEl, drawX, drawY, drawWidth, drawHeight, videoClip.cropSx, videoClip.cropSy, videoClip.cropSw, videoClip.cropSh, videoClip.zoomIntensity, currentTime - videoClip.timestamp)

    return { x: Math.round(drawX), y: Math.round(drawY), width: Math.round(drawWidth), height: Math.round(drawHeight) }
  }, [canvasRef, containerRef, applyCanvasSize, aspectRatio])

  const drawImages = useCallback((ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, currentTime: number, mainTrackOnly: boolean) => {
    const state = getState()
    const allImages = state.images
    let visibleImages = allImages.filter(img => currentTime >= img.startTime && currentTime < img.endTime && img.isMainTrack === mainTrackOnly)

    if (mainTrackOnly && visibleImages.length === 0) {
      const lastEnded = allImages.filter(img => img.isMainTrack && img.endTime <= currentTime).sort((a, b) => b.endTime - a.endTime)[0]
      if (lastEnded) visibleImages = [lastEnded]
    }

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH

    visibleImages.forEach((image) => {
      let img = imageElementsRef.current.get(image.id)
      
      if (mainTrackOnly && (!img || !img.complete || img.naturalWidth === 0)) {
        const lastEnded = allImages.filter(i => i.isMainTrack && i.endTime <= image.startTime).sort((a, b) => b.endTime - a.endTime)[0]
        if (lastEnded) {
          const prevImg = imageElementsRef.current.get(lastEnded.id)
          if (prevImg && prevImg.complete && prevImg.naturalWidth > 0) {
            ctx.save()
            ctx.globalAlpha = image.opacity
            applyZoomTransform(ctx, 'none', 0, prevImg, cr.x + image.x * xScale, cr.y + image.y * yScale, image.width * xScale, image.height * yScale, lastEnded.cropSx, lastEnded.cropSy, lastEnded.cropSw, lastEnded.cropSh, 0, 0)
            ctx.restore()
            return
          }
        }
      }

      if (!img || !img.complete || img.naturalWidth === 0) return
      
      const isSplit = image.zoom === 'split-horizontal' || image.zoom === 'split-vertical'
      let progress = 0
      if (isSplit) {
        progress = 1
      } else if (image.zoom === 'in' || image.zoom === 'out') {
        const transDur = Math.max(0.1, image.transitionDuration ?? 1.0)
        const elapsed = currentTime - image.startTime
        progress = Math.max(0, Math.min(1, elapsed / transDur))
      } else {
        progress = image.duration > 0 ? (currentTime - image.startTime) / image.duration : 0
      }
      ctx.save(); ctx.globalAlpha = image.opacity
      applyZoomTransform(ctx, image.zoom, progress, img, cr.x + image.x * xScale, cr.y + image.y * yScale, image.width * xScale, image.height * yScale, image.cropSx, image.cropSy, image.cropSw, image.cropSh, image.zoomIntensity, currentTime - image.startTime)
      ctx.restore()
    })
  }, [getState, aspectRatio])

  const drawOverlayVideos = useCallback((ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, currentTime: number) => {
    const state = getState(); const rate = state.playbackRate ?? 1; const overlayVideos = state.videos.filter(v => v.isOverlay)
    const logicalW = aspectRatio === '16:9' ? 1920 : 1080; const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH

    overlayVideos.forEach((video) => {
      const localTime = (currentTime - video.timestamp) * (video.playbackSpeed ?? 1)
      const vEl = videoElementsRef.current.get(video.id)
      if (localTime < 0 || localTime >= (video.duration ?? 0) * (video.playbackSpeed ?? 1)) {
        if (vEl && !vEl.paused) { const promise = videoPlayPromisesRef.current.get(video.id); if (promise) promise.then(() => vEl.pause()).catch(() => {}); else vEl.pause() }
        return
      }
      if (!vEl || vEl.readyState < 2) return
      const targetTime = (video.trimStart ?? 0) + localTime
      
      let progress = 0
      if (video.zoom === 'in' || video.zoom === 'out') {
        const transDur = Math.max(0.1, video.transitionDuration ?? 1.0)
        const elapsed = currentTime - video.timestamp
        progress = Math.max(0, Math.min(1, elapsed / transDur))
      } else {
        progress = video.duration && video.duration > 0 ? (currentTime - video.timestamp) / video.duration : 0
      }

      if (getState().isPlaying) {
        vEl.playbackRate = rate * (video.playbackSpeed ?? 1)
        if (vEl.paused && !videoPlayPromisesRef.current.has(video.id)) { const promise = vEl.play(); videoPlayPromisesRef.current.set(video.id, promise); promise.catch(() => {}).finally(() => { videoPlayPromisesRef.current.delete(video.id) }) }
        if (Math.abs(vEl.currentTime - targetTime) > 0.3) vEl.currentTime = targetTime
      } else {
        if (!vEl.paused) { const promise = videoPlayPromisesRef.current.get(video.id); if (promise) promise.then(() => { vEl.pause(); vEl.playbackRate = 1 }).catch(() => {}); else { vEl.pause(); vEl.playbackRate = 1 } }
        if (Math.abs(vEl.currentTime - targetTime) > 0.05) vEl.currentTime = targetTime
      }
      ctx.save(); ctx.globalAlpha = video.opacity
      applyZoomTransform(ctx, video.zoom, progress, vEl, cr.x + video.x * xScale, cr.y + video.y * yScale, video.width * xScale, video.height * yScale, video.cropSx ?? 0, video.cropSy ?? 0, video.cropSw ?? 1, video.cropSh ?? 1, video.zoomIntensity, localTime)
      ctx.restore()
    })
  }, [getState, aspectRatio])

  useEffect(() => {
    let currentVideoId: string | null = null; let lastKnownIsPlaying = false
    const drawOverlays = (ctx: CanvasRenderingContext2D, cr: {x:number,y:number,width:number,height:number}, t: number) => { drawImages(ctx, cr, t, false); drawOverlayVideos(ctx, cr, t) }
    const setupCanvas = (canvas: HTMLCanvasElement, container: HTMLDivElement) => { const rect = container.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) return null; const cw = Math.round(rect.width); const ch = Math.round(rect.height); const cr = applyCanvasSize(canvas, cw, ch); const ctx = canvas.getContext('2d'); return ctx ? { ctx, cr } : null }
    let lastTimestamp: number | null = null

    const loop = (timestamp: number) => {
      const state = getState(); const { playbackTime, isPlaying } = state; lastKnownIsPlaying = isPlaying
      const rate = state.playbackRate ?? 1; const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0; lastTimestamp = timestamp
      let newTime = playbackTime
      if (isPlaying) { newTime = playbackTime + delta * rate; const totalDur = state.getTotalDuration(); if (newTime >= totalDur) { state.setIsPlaying(false); state.setPlaybackTime(0); newTime = 0; lastTimestamp = null } else state.setPlaybackTime(newTime) } else lastTimestamp = null

      const sorted = getSortedMainItems(state.videos, state.images)
      const { activeItem: activeClip, nextItem: nextClip } = findActiveAndNextItems(sorted, newTime)
      const { transitionActive, progress: transProgress } = checkTransition(activeClip, nextClip, newTime)

      const canvas = canvasRef.current; const container = containerRef.current
      const audioEl = audioElementRef.current
      if (audioEl) {
        const audioItem = state.audios?.[0]
        if (audioItem) {
          const targetAudioTime = (audioItem.trimStart ?? 0) + Math.max(0, newTime - (audioItem.startTime ?? 0)) * (audioItem.playbackSpeed ?? 1)
          if (isPlaying) {
            audioEl.playbackRate = rate * (audioItem.playbackSpeed ?? 1)
            if (newTime < (audioItem.startTime ?? 0) || (newTime - (audioItem.startTime ?? 0)) >= ((audioItem.originalDuration ?? Infinity) - (audioItem.trimEnd ?? 0)) / (audioItem.playbackSpeed ?? 1)) { if (!audioEl.paused) { if (audioPlayPromiseRef.current) audioPlayPromiseRef.current.then(() => audioEl.pause()).catch(() => {}); else audioEl.pause() } }
            else { if (Math.abs(audioEl.currentTime - targetAudioTime) > 0.3) audioEl.currentTime = targetAudioTime; if (audioEl.paused && audioEl.readyState >= 2 && !audioPlayPromiseRef.current) { audioPlayPromiseRef.current = audioEl.play(); audioPlayPromiseRef.current.catch(() => {}).finally(() => { audioPlayPromiseRef.current = null }) } }
          } else { if (!audioEl.paused) { if (audioPlayPromiseRef.current) audioPlayPromiseRef.current.then(() => audioEl.pause()).catch(() => {}); else audioEl.pause() } if (Math.abs(audioEl.currentTime - targetAudioTime) > 0.2) audioEl.currentTime = targetAudioTime }
        }
      }

      if (canvas && container) {
        const res = setupCanvas(canvas, container)
        if (res) {
          const { ctx, cr } = res
          let transActive = false
          
          // Only clear to black if we are playing or if there is no main clip.
          // During scrubbing, we hold the previous frame until the new one is ready
          // to prevent black flickering.
          const shouldClear = isPlaying || !activeClip
          
          if (shouldClear) {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          }

          if (transitionActive) {
            const prog = transProgress
            transActive = true
            const logicalW = aspectRatio === '16:9' ? 1920 : 1080
            const logicalH = aspectRatio === '16:9' ? 1080 : 1920
            const xScale = cr.width / logicalW
            const yScale = cr.height / logicalH
            
            let nextEl: HTMLVideoElement | HTMLImageElement | null = null
            let nextParams: any = undefined
            if (nextClip!.type === 'video') {
              const nv = nextClip!.item as VideoClass
              nextEl = videoElementsRef.current.get(nextClip!.id) || null
              if (nextEl && nextEl.readyState >= 2 && (!isPlaying ? !nextEl.seeking : true)) {
                const local = nv.trimStart ?? 0
                if (Math.abs(nextEl.currentTime - local) > 0.25) nextEl.currentTime = local
                nextParams = { x: cr.x + (nv.x ?? 0) * xScale, y: cr.y + (nv.y ?? 0) * yScale, w: (nv.width ?? logicalW) * xScale, h: (nv.height ?? logicalH) * yScale, sx: nextEl.videoWidth * nv.cropSx, sy: nextEl.videoHeight * nv.cropSy, sw: nextEl.videoWidth * nv.cropSw, sh: nextEl.videoHeight * nv.cropSh }
              }
            } else {
              const ni = nextClip!.item as ImageClass
              nextEl = imageElementsRef.current.get(nextClip!.id) || null
              if (nextEl && nextEl.complete) {
                nextParams = { x: cr.x + ni.x * xScale, y: cr.y + ni.y * yScale, w: ni.width * xScale, h: ni.height * yScale, sx: nextEl.naturalWidth * ni.cropSx, sy: nextEl.naturalHeight * ni.cropSy, sw: nextEl.naturalWidth * ni.cropSw, sh: nextEl.naturalHeight * ni.cropSh }
              }
            }

            if (nextEl && nextParams) {
              ctx.drawImage(nextEl, nextParams.sx, nextParams.sy, nextParams.sw, nextParams.sh, nextParams.x, nextParams.y, nextParams.w, nextParams.h)
              let curEl: HTMLVideoElement | HTMLImageElement | null = null
              let curParams: any = undefined
              const drawX = cr.x + (activeClip!.item.x ?? 0) * xScale
              const drawY = cr.y + (activeClip!.item.y ?? 0) * yScale
              const drawW = (activeClip!.item.width ?? logicalW) * xScale
              const drawH = (activeClip!.item.height ?? logicalH) * yScale
              
              if (activeClip!.type === 'video') {
                const av = activeClip!.item as VideoClass
                curEl = videoElementsRef.current.get(activeClip!.id) || null
                if (curEl && curEl.readyState >= 2 && (!isPlaying ? !curEl.seeking : true)) {
                  const target = (av.trimStart ?? 0) + Math.max(0, newTime - activeClip!.startTime) * (av.playbackSpeed ?? 1)
                  if (Math.abs(curEl.currentTime - target) > 0.25) curEl.currentTime = target
                  curParams = { x: drawX, y: drawY, w: drawW, h: drawH, sx: curEl.videoWidth * (av.cropSx ?? 0), sy: curEl.videoHeight * (av.cropSy ?? 0), sw: curEl.videoWidth * (av.cropSw ?? 1), sh: curEl.videoHeight * (av.cropSh ?? 1) }
                }
              } else {
                const ai = activeClip!.item as ImageClass
                curEl = imageElementsRef.current.get(activeClip!.id) || null
                if (curEl && curEl.complete) {
                  curParams = { x: drawX, y: drawY, w: drawW, h: drawH, sx: curEl.naturalWidth * ai.cropSx, sy: curEl.naturalHeight * ai.cropSy, sw: curEl.naturalWidth * ai.cropSw, sh: curEl.naturalHeight * ai.cropSh }
                }
              }
              
              if (curEl && curParams) { 
                applyZoomTransform(ctx, nextClip!.item.zoom, prog, nextEl, nextParams.x, nextParams.y, nextParams.w, nextParams.h, nextClip!.item.cropSx, nextClip!.item.cropSy, nextClip!.item.cropSw, nextClip!.item.cropSh, nextClip!.item.zoomIntensity, 0, curEl, curParams)
              }
            }
          }

          if (!transActive) {
            if (activeClip) {
              if (activeClip.type === 'video') {
                const v = activeClip.item as VideoClass
                const vEl = videoElementsRef.current.get(activeClip.id)
                if (vEl) {
                  const target = (v.trimStart ?? 0) + Math.max(0, newTime - activeClip.startTime) * (v.playbackSpeed ?? 1)
                  if (currentVideoId !== activeClip.id) {
                    // Pause ALL video elements that are not the current one
                    videoElementsRef.current.forEach((el, id) => {
                      if (id !== activeClip.id && !el.paused) {
                        const p = videoPlayPromisesRef.current.get(id)
                        if (p) p.then(() => { el.pause(); el.playbackRate = 1 }).catch(() => {})
                        else { el.pause(); el.playbackRate = 1 }
                      }
                    })

                    currentVideoId = activeClip.id
                    if (getSelectionState().selectedVideoId !== activeClip.id) getSelectionState().setSelectedVideoId(activeClip.id)
                    
                    vEl.currentTime = target
                  }
                  if (isPlaying) {
                    vEl.playbackRate = rate * (v.playbackSpeed ?? 1)
                    if (Math.abs(vEl.currentTime - target) > 0.3) vEl.currentTime = target
                    if (vEl.paused && vEl.readyState >= 2 && !videoPlayPromisesRef.current.has(activeClip.id)) {
                      const p = vEl.play()
                      videoPlayPromisesRef.current.set(activeClip.id, p)
                      p.catch(() => {}).finally(() => { videoPlayPromisesRef.current.delete(activeClip.id) })
                    }
                  } else {
                    if (!vEl.paused) {
                      const p = videoPlayPromisesRef.current.get(activeClip.id)
                      if (p) p.then(() => { vEl.pause(); vEl.playbackRate = 1 }).catch(() => {})
                      else { vEl.pause(); vEl.playbackRate = 1 }
                    }
                    if (Math.abs(vEl.currentTime - target) > 0.05) {
                      vEl.currentTime = target
                    }
                  }
                  drawVideoToCanvas(vEl, activeClip.item as VideoClass, newTime)
                }
              } else {
                // If switching from video to image, pause ALL videos
                videoElementsRef.current.forEach((el, id) => {
                  if (!el.paused) {
                    const p = videoPlayPromisesRef.current.get(id)
                    if (p) p.then(() => { el.pause(); el.playbackRate = 1 }).catch(() => {})
                    else { el.pause(); el.playbackRate = 1 }
                  }
                })
                currentVideoId = null
                drawImages(ctx, cr, newTime, true)
              }
            } else {
              // If no active clip, pause ALL videos
              videoElementsRef.current.forEach((el, id) => {
                if (!el.paused) {
                  const p = videoPlayPromisesRef.current.get(id)
                  if (p) p.then(() => { el.pause(); el.playbackRate = 1 }).catch(() => {})
                  else { el.pause(); el.playbackRate = 1 }
                }
              })
              currentVideoId = null
              ctx.fillStyle = '#000000'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              drawImages(ctx, cr, newTime, true)
            }
          }
          drawOverlays(ctx, cr, newTime)
          const eff = state.effects?.find(e => newTime >= e.startTime && newTime < e.endTime)
          if (eff) applyEffect(ctx, eff.type, cr.x, cr.y, cr.width, cr.height, newTime)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getState, getSelectionState, drawVideoToCanvas, drawImages, drawOverlayVideos, canvasRef, applyCanvasSize, aspectRatio])

  useEffect(() => { return () => { videoElementsRef.current.forEach((video) => { video.pause(); video.src = ''; video.load() }); videoElementsRef.current.clear() } }, [])
  return { contentRect }
}
