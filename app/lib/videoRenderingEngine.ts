import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { MainItem, calculateAnimationProgress } from '@/app/lib/renderUtils'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'

export interface RenderState {
  playbackTime: number
  isPlaying: boolean
  playbackRate: number
  aspectRatio: '16:9' | '9:16'
  videos: VideoClass[]
  images: ImageClass[]
  effects: any[]
  selectedVideoId: string | null
}

export interface RenderResources {
  videoElements: Map<string, HTMLVideoElement>
  imageBitmaps: Map<string, ImageBitmap>
  bufferCanvas: HTMLCanvasElement | null
  persistenceCanvases: Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>
}

export class VideoRenderingEngine {
  private lastRenderedTime: number = -1
  private lastStateKey: string = ''
  private currentVideoId: string | null = null
  private frameStallCount: number = 0
  private lastLogTime: number = 0

  public render(
    canvas: HTMLCanvasElement,
    cr: { x: number; y: number; width: number; height: number },
    state: RenderState,
    resources: RenderResources,
    sortedMainItems: MainItem[],
    activeClip: MainItem | null,
    nextClip: MainItem | null,
    transitionActive: boolean,
    transProgress: number,
    onVideoTimeUpdate: (id: string, time: number) => void,
    onVideoPlayState: (id: string, playing: boolean, rate: number) => void,
    onSelectionUpdate: (id: string) => void
  ) {
    const { playbackTime: newTime, isPlaying, playbackRate: rate, aspectRatio, effects } = state
    const { videoElements, imageBitmaps, bufferCanvas, persistenceCanvases } = resources

    if (!bufferCanvas) return

    const bufferCtx = bufferCanvas.getContext('2d', { alpha: false })!
    const visibleCtx = canvas.getContext('2d', { alpha: false })!

    const activeEl = activeClip?.type === 'video' 
      ? videoElements.get(activeClip.id) 
      : activeClip?.type === 'image' 
        ? imageBitmaps.get(activeClip.id) 
        : null

    // Readiness check for scrubbing vs playing
    // When playing, we are less strict to keep sync.
    // When scrubbing, we want to be strict to avoid black frames, but NOT so strict that we freeze.
    const isActiveReady = activeClip?.type === 'video'
      ? (activeEl instanceof HTMLVideoElement && activeEl.readyState >= 2)
      : activeClip?.type === 'image'
        ? (!!activeEl)
        : true

    let isNextReady = true
    if (transitionActive && nextClip) {
      const nextEl = nextClip.type === 'video'
        ? videoElements.get(nextClip.id)
        : imageBitmaps.get(nextClip.id)
      isNextReady = nextClip.type === 'video'
        ? (nextEl instanceof HTMLVideoElement && nextEl.readyState >= 2)
        : nextClip.type === 'image'
          ? (!!nextEl)
          : true
    }

    const stateKey = activeClip ? `${activeClip.id}-${activeClip.type}-${activeClip.item.x}-${activeClip.item.y}-${activeClip.item.width}-${activeClip.item.height}-${cr.width}-${cr.height}-${state.videos.length}-${state.images.length}-${effects.length}` : `none-${effects.length}`
    const stateChanged = stateKey !== this.lastStateKey
    const isReady = isActiveReady && isNextReady
    const timeChanged = Math.abs(newTime - this.lastRenderedTime) > 0.001
    const isVideo = activeClip?.type === 'video'

    // Swap if:
    // 1. We have a ready frame (readyState >= 2)
    // 2. We are playing (force progress)
    // 3. Layout changed (force update)
    // 4. No clip (empty space)
    const shouldSwap = !activeClip || isReady || isPlaying || stateChanged

    if (!isPlaying && !isReady && isVideo) {
      this.frameStallCount++
      const now = Date.now()
      if (now - this.lastLogTime > 500) {
        const vEl = videoElements.get(activeClip.id)
        console.warn(`[VideoEngine] Frame stall: clip=${activeClip.id}, readyState=${vEl?.readyState}, seeking=${vEl?.seeking}, count=${this.frameStallCount}`)
        this.lastLogTime = now
      }
    } else {
      this.frameStallCount = 0
    }

    if (shouldSwap || timeChanged) {
      // 2. Manage Video Element States (Seeks & Playback)
      if (activeClip && activeClip.type === 'video') {
        const v = activeClip.item as VideoClass
        const vEl = videoElements.get(activeClip.id)
        if (vEl) {
          const target = (v.trimStart ?? 0) + Math.max(0, newTime - activeClip.startTime) * (v.playbackSpeed ?? 1)
          
          if (this.currentVideoId !== activeClip.id) {
            videoElements.forEach((el, id) => {
              if (id !== activeClip.id && !el.paused) onVideoPlayState(id, false, 1)
            })
            this.currentVideoId = activeClip.id
            if (state.selectedVideoId !== activeClip.id) onSelectionUpdate(activeClip.id)
            vEl.currentTime = target
          }

          if (isPlaying) {
            if (Math.abs(vEl.currentTime - target) > 0.3) vEl.currentTime = target
            onVideoPlayState(activeClip.id, true, rate * (v.playbackSpeed ?? 1))
          } else {
            if (!vEl.paused) onVideoPlayState(activeClip.id, false, 1)
            // Throttle seeks during scroll to prevent browser lockup
            if (Math.abs(vEl.currentTime - target) > 0.15) {
              vEl.currentTime = target
            }
          }
        }
      } else if (activeClip) {
        videoElements.forEach((el, id) => {
          if (!el.paused) onVideoPlayState(id, false, 1)
        })
        this.currentVideoId = null
      }

      // 3. Render to Buffer
      if (shouldSwap) {
        let backgroundDrawn = false
        
        // We clear and draw background if readyState is sufficient
        const canDrawBackground = !isVideo || isReady || (isPlaying && activeEl instanceof HTMLVideoElement && activeEl.readyState >= 2)
        
        if (canDrawBackground) {
          bufferCtx.fillStyle = '#000000'
          bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height)
          backgroundDrawn = true
        }

        let transActive = false
        const logicalW = aspectRatio === '16:9' ? 1920 : 1080
        const logicalH = aspectRatio === '16:9' ? 1080 : 1920
        const xScale = cr.width / logicalW
        const yScale = cr.height / logicalH

        if (transitionActive && nextClip && backgroundDrawn) {
          transActive = true
          let nextEl: HTMLVideoElement | ImageBitmap | null = null
          let nextParams: any = undefined
          if (nextClip.type === 'video') {
            const nv = nextClip.item as VideoClass
            nextEl = videoElements.get(nextClip.id) || null
            if (nextEl instanceof HTMLVideoElement && nextEl.readyState >= 2) {
              nextParams = { x: cr.x + (nv.x ?? 0) * xScale, y: cr.y + (nv.y ?? 0) * yScale, w: (nv.width ?? logicalW) * xScale, h: (nv.height ?? logicalH) * yScale, sx: nextEl.videoWidth * nv.cropSx, sy: nextEl.videoHeight * nv.cropSy, sw: nextEl.videoWidth * nv.cropSw, sh: nextEl.videoHeight * nv.cropSh }
            }
          } else {
            const ni = nextClip.item as ImageClass
            nextEl = imageBitmaps.get(nextClip.id) || null
            if (nextEl) {
              nextParams = { x: cr.x + ni.x * xScale, y: cr.y + ni.y * yScale, w: ni.width * xScale, h: ni.height * yScale, sx: nextEl.width * ni.cropSx, sy: nextEl.height * ni.cropSy, sw: nextEl.width * ni.cropSw, sh: nextEl.height * ni.cropSh }
            }
          }

          if (activeClip && nextEl && nextParams) {
            let curEl: HTMLVideoElement | ImageBitmap | null = null
            let curParams: any = undefined
            if (activeClip.type === 'video') {
              const av = activeClip.item as VideoClass
              curEl = videoElements.get(activeClip.id) || null
              if (curEl instanceof HTMLVideoElement && curEl.readyState >= 2) {
                curParams = { x: cr.x + (av.x ?? 0) * xScale, y: cr.y + (av.y ?? 0) * yScale, w: (av.width ?? logicalW) * xScale, h: (av.height ?? logicalH) * yScale, sx: curEl.videoWidth * (av.cropSx ?? 0), sy: curEl.videoHeight * (av.cropSy ?? 0), sw: curEl.videoWidth * (av.cropSw ?? 1), sh: curEl.videoHeight * (av.cropSh ?? 1) }
              }
            } else {
              const ai = activeClip.item as ImageClass
              curEl = imageBitmaps.get(activeClip.id) || null
              if (curEl) {
                curParams = { x: cr.x + ai.x * xScale, y: cr.y + ai.y * yScale, w: ai.width * xScale, h: ai.height * yScale, sx: curEl.width * ai.cropSx, sy: curEl.height * ai.cropSy, sw: curEl.width * ai.cropSw, sh: curEl.height * ai.cropSh }
              }
            }

            if (curEl && curParams) {
              const nextItem = nextClip.item
              const activeItem = activeClip.item
              const elapsedB = newTime - nextClip.startTime
              const elapsedA = newTime - activeClip.startTime
              const progB = calculateAnimationProgress(nextItem, newTime, nextClip.startTime)
              const progA = calculateAnimationProgress(activeItem, newTime, activeClip.startTime)
              applyZoomTransform(bufferCtx, nextItem.animation, nextItem.transition, transProgress, nextEl, nextParams.x, nextParams.y, nextParams.w, nextParams.h, nextItem.cropSx, nextItem.cropSy, nextItem.cropSw, nextItem.cropSh, nextItem.zoomIntensity, elapsedB, curEl, activeItem.animation, progA, elapsedA, activeItem.zoomIntensity, curParams)
            }
          }
        }

        if (!transActive && backgroundDrawn) {
          if (activeClip) {
            if (activeClip.type === 'video') {
              const vEl = videoElements.get(activeClip.id)
              if (vEl && vEl.readyState >= 2) {
                this.drawVideo(bufferCtx, cr, vEl, activeClip.item as VideoClass, newTime, isPlaying, persistenceCanvases, aspectRatio, canvas)
              } else {
                backgroundDrawn = false
              }
            } else {
              this.drawMainImages(bufferCtx, cr, newTime, state.images, imageBitmaps, aspectRatio)
            }
          } else {
            this.drawMainImages(bufferCtx, cr, newTime, state.images, imageBitmaps, aspectRatio)
          }
        }

        if (backgroundDrawn) {
          this.drawOverlays(bufferCtx, cr, newTime, state.images, state.videos, videoElements, imageBitmaps, aspectRatio, isPlaying)
          effects?.filter(e => newTime >= e.startTime && newTime < e.endTime)
                 .sort((a, b) => a.row - b.row)
                 .forEach(eff => { applyEffect(bufferCtx, eff.type, cr.x, cr.y, cr.width, cr.height, newTime) })

          if (this.frameStallCount > 10) {
            bufferCtx.save(); bufferCtx.fillStyle = 'rgba(255, 0, 0, 0.3)'; bufferCtx.fillRect(cr.x, cr.y, 4, 20); bufferCtx.restore()
          }

          // Atomic visible swap
          visibleCtx.drawImage(bufferCanvas, 0, 0)
          this.lastStateKey = stateKey
          this.lastRenderedTime = newTime
        }
      }
    }
  }

  private drawVideo(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    videoEl: HTMLVideoElement,
    videoClip: VideoClass,
    currentTime: number,
    isPlaying: boolean,
    persistenceCanvases: Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>,
    aspectRatio: string,
    mainCanvas: HTMLCanvasElement
  ) {
    if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return

    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    const drawX = cr.x + (videoClip.x ?? 0) * xScale
    const drawY = cr.y + (videoClip.y ?? 0) * yScale
    const drawWidth = (videoClip.width ?? logicalW) * xScale
    const drawHeight = (videoClip.height ?? logicalH) * yScale
    const progress = calculateAnimationProgress(videoClip, currentTime, videoClip.timestamp)

    if (videoClip.playbackSpeed < 1.0 && isPlaying) {
      let pCanvases = persistenceCanvases.get(videoClip.id)
      if (!pCanvases) {
        const current = document.createElement('canvas')
        const accumulation = document.createElement('canvas')
        current.width = mainCanvas.width; current.height = mainCanvas.height
        accumulation.width = mainCanvas.width; accumulation.height = mainCanvas.height
        pCanvases = { current, accumulation }
        persistenceCanvases.set(videoClip.id, pCanvases)
      }
      const curCtx = pCanvases.current.getContext('2d')!
      const accCtx = pCanvases.accumulation.getContext('2d')!
      curCtx.clearRect(0, 0, pCanvases.current.width, pCanvases.current.height)
      applyZoomTransform(curCtx, videoClip.animation, videoClip.transition, progress, videoEl, drawX, drawY, drawWidth, drawHeight, videoClip.cropSx, videoClip.cropSy, videoClip.cropSw, videoClip.cropSh, videoClip.zoomIntensity, currentTime - videoClip.timestamp)
      accCtx.save(); accCtx.globalAlpha = 0.45; accCtx.drawImage(pCanvases.current, 0, 0); accCtx.restore()
      ctx.drawImage(pCanvases.accumulation, 0, 0)
    } else {
      applyZoomTransform(ctx, videoClip.animation, videoClip.transition, progress, videoEl, drawX, drawY, drawWidth, drawHeight, videoClip.cropSx, videoClip.cropSy, videoClip.cropSw, videoClip.cropSh, videoClip.zoomIntensity, currentTime - videoClip.timestamp)
    }
  }

  private drawMainImages(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    currentTime: number,
    images: ImageClass[],
    imageBitmaps: Map<string, ImageBitmap>,
    aspectRatio: string
  ) {
    const mainTrackImages = images.filter(img => (img as any).row === 0)
    let visibleImages = mainTrackImages.filter(img => currentTime >= img.startTime && currentTime < img.endTime)
    if (visibleImages.length === 0) {
      const lastEnded = mainTrackImages.filter(img => img.endTime <= currentTime).sort((a, b) => b.endTime - a.endTime)[0]
      if (lastEnded) visibleImages = [lastEnded]
    }
    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    visibleImages.forEach((image) => {
      let bitmap = imageBitmaps.get(image.id)
      if (!bitmap) {
        const lastEnded = mainTrackImages.filter(i => i.endTime <= image.startTime).sort((a, b) => b.endTime - a.endTime)[0]
        if (lastEnded) {
          const prevBitmap = imageBitmaps.get(lastEnded.id)
          if (prevBitmap) {
            ctx.save(); ctx.globalAlpha = image.opacity
            applyZoomTransform(ctx, 'none', 'none', 0, prevBitmap, cr.x + (image.x ?? 0) * xScale, cr.y + (image.y ?? 0) * yScale, (image.width ?? logicalW) * xScale, (image.height ?? logicalH) * yScale, lastEnded.cropSx, lastEnded.cropSy, lastEnded.cropSw, lastEnded.cropSh, 0, 0)
            ctx.restore()
            return
          }
        }
      }
      if (!bitmap) return
      const progress = calculateAnimationProgress(image, currentTime, image.startTime)
      ctx.save(); ctx.globalAlpha = image.opacity
      applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, cr.x + (image.x ?? 0) * xScale, cr.y + (image.y ?? 0) * yScale, (image.width ?? logicalW) * xScale, (image.height ?? logicalH) * yScale, image.cropSx, image.cropSy, image.cropSw, image.cropSh, image.zoomIntensity, currentTime - image.startTime)
      ctx.restore()
    })
  }

  private drawOverlays(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    currentTime: number,
    images: ImageClass[],
    videos: VideoClass[],
    videoElements: Map<string, HTMLVideoElement>,
    imageBitmaps: Map<string, ImageBitmap>,
    aspectRatio: string,
    isPlaying: boolean
  ) {
    const logicalW = aspectRatio === '16:9' ? 1920 : 1080
    const logicalH = aspectRatio === '16:9' ? 1080 : 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    images.filter(img => (img as any).row > 0 && currentTime >= img.startTime && currentTime < img.endTime).forEach(image => {
      const bitmap = imageBitmaps.get(image.id); if (!bitmap) return
      const progress = calculateAnimationProgress(image, currentTime, image.startTime)
      ctx.save(); ctx.globalAlpha = image.opacity
      applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, cr.x + (image.x ?? 0) * xScale, cr.y + (image.y ?? 0) * yScale, (image.width ?? logicalW) * xScale, (image.height ?? logicalH) * yScale, image.cropSx, image.cropSy, image.cropSw, image.cropSh, image.zoomIntensity, currentTime - image.startTime)
      ctx.restore()
    })
    videos.filter(v => v.isOverlay).forEach(video => {
      const localTime = (currentTime - video.timestamp) * (video.playbackSpeed ?? 1)
      const vEl = videoElements.get(video.id)
      if (localTime < 0 || localTime >= (video.duration ?? 0) * (video.playbackSpeed ?? 1)) return
      if (!vEl || vEl.readyState < 2 || vEl.seeking) return
      const progress = calculateAnimationProgress(video, currentTime, video.timestamp)
      ctx.save(); ctx.globalAlpha = video.opacity
      applyZoomTransform(ctx, video.animation, video.transition, progress, vEl, cr.x + video.x * xScale, cr.y + video.y * yScale, video.width * xScale, video.height * yScale, video.cropSx ?? 0, video.cropSy ?? 0, video.cropSw ?? 1, video.cropSh ?? 1, video.zoomIntensity, currentTime - video.timestamp)
      ctx.restore()
    })
  }
}
