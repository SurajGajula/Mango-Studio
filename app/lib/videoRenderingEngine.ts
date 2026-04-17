import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { EffectClass } from '@/app/models/EffectClass'
import { MainItem, calculateAnimationProgress, clipTimelineSpanForSourceMap, videoTimelineSourceMapping } from '@/app/lib/renderUtils'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { runWithPlacementRotation } from '@/app/lib/placementRotation'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'

export interface RenderState {
  playbackTime: number
  isPlaying: boolean
  playbackRate: number
  videos: VideoClass[]
  images: ImageClass[]
  effects: EffectClass[]
}

export interface RenderResources {
  videoElements: Map<string, HTMLVideoElement>
  imageBitmaps: Map<string, ImageBitmap>
  bufferCanvas: HTMLCanvasElement | null
  persistenceCanvases: Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>
}

const PAUSED_SCRUB_SEEK_THRESHOLD = 0.16
const PREVIEW_CHROME_FILL = '#0f0f0f'

function fillCanvasGuttersOutsideContentRect(
  ctx: CanvasRenderingContext2D,
  cr: { x: number; y: number; width: number; height: number }
) {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  ctx.save()
  ctx.fillStyle = PREVIEW_CHROME_FILL
  if (cr.y > 0) ctx.fillRect(0, 0, cw, cr.y)
  if (cr.y + cr.height < ch) ctx.fillRect(0, cr.y + cr.height, cw, ch - cr.y - cr.height)
  if (cr.x > 0) ctx.fillRect(0, cr.y, cr.x, cr.height)
  if (cr.x + cr.width < cw) ctx.fillRect(cr.x + cr.width, cr.y, cw - cr.x - cr.width, cr.height)
  ctx.restore()
}

function videoElementHasDrawableFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= 1
}

export class VideoRenderingEngine {
  private lastRenderedTime: number = -1
  private lastStateKey: string = ''
  private currentVideoId: string | null = null
  private frameStallCount: number = 0
  private lastLogTime: number = 0
  private lastTransformStates: Map<string, { x: number, y: number, w: number, h: number, time: number }> = new Map()

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
    onVideoPlayState: (id: string, playing: boolean, rate: number) => void
  ) {
    const { playbackTime: newTime, isPlaying, playbackRate: rate, effects } = state
    const { videoElements, imageBitmaps, bufferCanvas, persistenceCanvases } = resources

    if (!bufferCanvas) return

    const bufferCtx = bufferCanvas.getContext('2d', { alpha: false })!
    const visibleCtx = canvas.getContext('2d', { alpha: false })!

    // Cleanup stale transform states
    const activeClipIds = new Set(state.videos.map(v => v.id))
    this.lastTransformStates.forEach((_, id) => {
      if (!activeClipIds.has(id)) this.lastTransformStates.delete(id)
    })

    const activeEl = activeClip?.type === 'video' 
      ? videoElements.get(activeClip.id) 
      : activeClip?.type === 'image' 
        ? imageBitmaps.get(activeClip.id) 
        : null

    const isActiveReady = activeClip?.type === 'video'
      ? (activeEl instanceof HTMLVideoElement && videoElementHasDrawableFrame(activeEl))
      : !!activeEl

    let isNextReady = true
    if (transitionActive && nextClip) {
      const nextEl = nextClip.type === 'video' ? videoElements.get(nextClip.id) : imageBitmaps.get(nextClip.id)
      isNextReady =
        nextClip.type === 'video'
          ? (nextEl instanceof HTMLVideoElement && videoElementHasDrawableFrame(nextEl))
          : !!nextEl
    }

    const stateKey = activeClip ? `${activeClip.id}-${cr.width}-${cr.height}-${state.videos.length}-${state.images.length}-${effects.length}` : `none-${effects.length}`
    const stateChanged = stateKey !== this.lastStateKey
    const isReady = isActiveReady && isNextReady
    
    const timeChanged = Math.abs(newTime - this.lastRenderedTime) > 0.001
    const isVideo = activeClip?.type === 'video'
    const shouldSwap = !activeClip || isReady || isPlaying || stateChanged

    if (shouldSwap || timeChanged) {
      // 2. Manage Video Element States (Seeks & Playback)
      if (activeClip && activeClip.type === 'video') {
        const v = activeClip.item as VideoClass
        const vEl = videoElements.get(activeClip.id)
        if (vEl) {
          const elapsed = Math.max(0, newTime - activeClip.startTime)
          const clipDur = clipTimelineSpanForSourceMap(v.duration)
          const tm = videoTimelineSourceMapping(v, elapsed, clipDur)
          const target = (v.trimStart ?? 0) + tm.sourceElapsed
          
          if (this.currentVideoId !== activeClip.id) {
            videoElements.forEach((el, id) => {
              if (id !== activeClip.id && (!nextClip || id !== nextClip.id) && !el.paused) {
                const maybeOv = state.videos.find((v) => v.id === id)
                if (
                  maybeOv?.isOverlay &&
                  newTime >= maybeOv.timestamp &&
                  newTime < maybeOv.timestamp + (maybeOv.duration ?? 0)
                ) {
                  return
                }
                onVideoPlayState(id, false, 1)
              }
            })
            this.currentVideoId = activeClip.id

            // Only seek if we are far from the target.
            if (Math.abs(vEl.currentTime - target) > 0.1) {
              vEl.currentTime = target
              onVideoTimeUpdate(activeClip.id, target)
            }
          }

          if (isPlaying) {
            const drift = Math.abs(vEl.currentTime - target)
            const playSeekThreshold = 0.22
            if (drift > playSeekThreshold) {
              vEl.currentTime = target
              onVideoTimeUpdate(activeClip.id, target)
            }

            if (tm.inHold) {
              if (!vEl.paused) {
                onVideoPlayState(activeClip.id, false, 1)
              }
            } else {
              const x = tm.playSpan > 0 ? Math.min(elapsed, tm.playSpan) / tm.playSpan : 1
              let f = x
              if (v.speedEasing === 'ease') {
                f = 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3)
              }
              const instantaneousSpeed = (v.speedStart ?? v.playbackSpeed ?? 1) + 
                f * ((v.speedEnd ?? v.playbackSpeed ?? 1) - (v.speedStart ?? v.playbackSpeed ?? 1))

              const targetRate = rate * instantaneousSpeed
              if (vEl.paused || Math.abs(vEl.playbackRate - targetRate) > 0.01) {
                onVideoPlayState(activeClip.id, true, targetRate)
              }
            }
          } else {
            if (!vEl.paused) {
              onVideoPlayState(activeClip.id, false, 1)
            }
            if (Math.abs(vEl.currentTime - target) > PAUSED_SCRUB_SEEK_THRESHOLD) {
              vEl.currentTime = target
              onVideoTimeUpdate(activeClip.id, target)
            }
          }
        }
      }

      // Pre-roll / Manage Next Video Element (for transitions)
      if (nextClip && nextClip.type === 'video') {
        const nv = nextClip.item as VideoClass
        const nvEl = videoElements.get(nextClip.id)
        if (nvEl) {
          const elapsedB = Math.max(0, newTime - nextClip.startTime)
          const nvClipDur = clipTimelineSpanForSourceMap(nv.duration)
          const tmB = videoTimelineSourceMapping(nv, elapsedB, nvClipDur)
          const targetB = (nv.trimStart ?? 0) + tmB.sourceElapsed
          
          const timeUntilNext = nextClip.startTime - newTime
          const isInTransitionWindow = transitionActive || (timeUntilNext > 0 && timeUntilNext < 1.0)

          const freezeNextAtFirstFrame = transitionActive && transProgress < 1

          if (isInTransitionWindow) {
            if (freezeNextAtFirstFrame) {
              if (!nvEl.paused) {
                onVideoPlayState(nextClip.id, false, 1)
              }
              if (Math.abs(nvEl.currentTime - targetB) > PAUSED_SCRUB_SEEK_THRESHOLD) {
                nvEl.currentTime = targetB
                onVideoTimeUpdate(nextClip.id, targetB)
              }
            } else if (isPlaying) {
              const warmupWindow = 0.2
              const shouldPlayNow = (nextClip.startTime - newTime) < warmupWindow

              if (shouldPlayNow) {
                if (Math.abs(nvEl.currentTime - targetB) > 0.25) {
                  nvEl.currentTime = targetB
                  onVideoTimeUpdate(nextClip.id, targetB)
                }
                if (tmB.inHold) {
                  if (!nvEl.paused) {
                    onVideoPlayState(nextClip.id, false, 1)
                  }
                } else {
                  const x = tmB.playSpan > 0 ? Math.min(elapsedB, tmB.playSpan) / tmB.playSpan : 1
                  let f = x
                  if (nv.speedEasing === 'ease') {
                    f = 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3)
                  }
                  const instantaneousSpeedB = (nv.speedStart ?? nv.playbackSpeed ?? 1) + 
                    f * ((nv.speedEnd ?? nv.playbackSpeed ?? 1) - (nv.speedStart ?? nv.playbackSpeed ?? 1))
                  
                  const targetRateB = rate * instantaneousSpeedB
                  if (nvEl.paused || Math.abs(nvEl.playbackRate - targetRateB) > 0.01) {
                    onVideoPlayState(nextClip.id, true, targetRateB)
                  }
                }
              } else {
                if (!nvEl.paused) {
                  onVideoPlayState(nextClip.id, false, 1)
                }
                if (Math.abs(nvEl.currentTime - targetB) > 0.1) {
                  nvEl.currentTime = targetB
                  onVideoTimeUpdate(nextClip.id, targetB)
                }
              }
            } else {
              if (Math.abs(nvEl.currentTime - targetB) > PAUSED_SCRUB_SEEK_THRESHOLD) {
                nvEl.currentTime = targetB
                onVideoTimeUpdate(nextClip.id, targetB)
              }
            }
          }
        }
      }

      for (let i = 0; i < state.videos.length; i++) {
        const ov = state.videos[i]
        if (!ov.isOverlay) continue
        const span = ov.duration ?? 0
        if (span <= 0 || newTime < ov.timestamp || newTime >= ov.timestamp + span) continue
        const ovEl = videoElements.get(ov.id)
        if (!ovEl) continue
        const elapsedOv = Math.max(0, newTime - ov.timestamp)
        const ovTimelineDur = clipTimelineSpanForSourceMap(ov.duration)
        const tmOv = videoTimelineSourceMapping(ov, elapsedOv, ovTimelineDur)
        const targetOv = (ov.trimStart ?? 0) + tmOv.sourceElapsed
        if (isPlaying) {
          const driftOv = Math.abs(ovEl.currentTime - targetOv)
          if (driftOv > 0.22) {
            ovEl.currentTime = targetOv
            onVideoTimeUpdate(ov.id, targetOv)
          }
          if (tmOv.inHold) {
            if (!ovEl.paused) {
              onVideoPlayState(ov.id, false, 1)
            }
          } else {
            const xOv = tmOv.playSpan > 0 ? Math.min(elapsedOv, tmOv.playSpan) / tmOv.playSpan : 1
            let fOv = xOv
            if (ov.speedEasing === 'ease') {
              fOv = 3 * Math.pow(xOv, 2) - 2 * Math.pow(xOv, 3)
            }
            const instSpeedOv =
              (ov.speedStart ?? ov.playbackSpeed ?? 1) +
              fOv * ((ov.speedEnd ?? ov.playbackSpeed ?? 1) - (ov.speedStart ?? ov.playbackSpeed ?? 1))
            const targetRateOv = rate * instSpeedOv
            if (ovEl.paused || Math.abs(ovEl.playbackRate - targetRateOv) > 0.01) {
              onVideoPlayState(ov.id, true, targetRateOv)
            }
          }
        } else {
          if (Math.abs(ovEl.currentTime - targetOv) > PAUSED_SCRUB_SEEK_THRESHOLD) {
            ovEl.currentTime = targetOv
            onVideoTimeUpdate(ov.id, targetOv)
          }
          if (!ovEl.paused) onVideoPlayState(ov.id, false, 1)
        }
      }

      // Cleanup: pause any video that is not the active or next one
      const activeVideoId = activeClip?.type === 'video' ? activeClip.id : null
      const nextVideoId = nextClip?.type === 'video' ? nextClip.id : null
      
      // Also exempt overlay videos that are currently visible
      const overlayVideoIds = new Set<string>()
      for (let i = 0; i < state.videos.length; i++) {
        const v = state.videos[i]
        if (v.isOverlay && newTime >= v.timestamp && newTime < v.timestamp + (v.duration ?? 0)) {
          overlayVideoIds.add(v.id)
        }
      }

      videoElements.forEach((el, id) => {
        if (id !== activeVideoId && id !== nextVideoId && !overlayVideoIds.has(id) && !el.paused) {
          onVideoPlayState(id, false, 1)
        }
      })
      if (!activeVideoId) this.currentVideoId = null

      // 3. Render to Buffer
      if (shouldSwap || timeChanged) {
        let backgroundDrawn = false
        
        const canDrawBackground =
          !isVideo ||
          isReady ||
          (isPlaying && activeEl instanceof HTMLVideoElement && videoElementHasDrawableFrame(activeEl))
        
        if (canDrawBackground || timeChanged) {
          bufferCtx.fillStyle = PREVIEW_CHROME_FILL
          bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height)
          bufferCtx.fillStyle = '#000000'
          bufferCtx.fillRect(cr.x, cr.y, cr.width, cr.height)
          backgroundDrawn = true
        }

        let transActive = false
        const logicalW = 1080
        const logicalH = 1920
        const xScale = cr.width / logicalW
        const yScale = cr.height / logicalH

        if (transitionActive && nextClip && backgroundDrawn && transProgress < 1.0) {
          const elapsedB = Math.max(0, newTime - nextClip.startTime)
          const elapsedA = activeClip ? Math.max(0, newTime - activeClip.startTime) : 0
          let nextEl: HTMLVideoElement | ImageBitmap | null = null
          let nextParams: any = undefined
          if (nextClip.type === 'video') {
            const nv = nextClip.item as VideoClass
            nextEl = videoElements.get(nextClip.id) || null
            if (nextEl instanceof HTMLVideoElement && videoElementHasDrawableFrame(nextEl)) {
              const kn = resolveMediaKeyframeTransform(nv, elapsedB, nv.duration ?? 0)
              nextParams = {
                x: cr.x + (nv.x ?? 0) * xScale,
                y: cr.y + (nv.y ?? 0) * yScale,
                w: (nv.width ?? logicalW) * xScale,
                h: (nv.height ?? logicalH) * yScale,
                sx: nextEl.videoWidth * kn.cropSx,
                sy: nextEl.videoHeight * kn.cropSy,
                sw: nextEl.videoWidth * kn.cropSw,
                sh: nextEl.videoHeight * kn.cropSh,
              }
            }
          } else {
            const ni = nextClip.item as ImageClass
            nextEl = imageBitmaps.get(nextClip.id) || null
            if (nextEl) {
              const kn = resolveMediaKeyframeTransform(ni, elapsedB, ni.duration)
              nextParams = {
                x: cr.x + ni.x * xScale,
                y: cr.y + ni.y * yScale,
                w: ni.width * xScale,
                h: ni.height * yScale,
                sx: nextEl.width * kn.cropSx,
                sy: nextEl.height * kn.cropSy,
                sw: nextEl.width * kn.cropSw,
                sh: nextEl.height * kn.cropSh,
              }
            }
          }

          if (activeClip && nextEl && nextParams) {
            let curEl: HTMLVideoElement | ImageBitmap | null = null
            let curParams: any = undefined
            if (activeClip.type === 'video') {
              const av = activeClip.item as VideoClass
              curEl = videoElements.get(activeClip.id) || null
              if (curEl instanceof HTMLVideoElement && videoElementHasDrawableFrame(curEl)) {
                const ka = resolveMediaKeyframeTransform(av, elapsedA, av.duration ?? 0)
                curParams = {
                  x: cr.x + (av.x ?? 0) * xScale,
                  y: cr.y + (av.y ?? 0) * yScale,
                  w: (av.width ?? logicalW) * xScale,
                  h: (av.height ?? logicalH) * yScale,
                  sx: curEl.videoWidth * ka.cropSx,
                  sy: curEl.videoHeight * ka.cropSy,
                  sw: curEl.videoWidth * ka.cropSw,
                  sh: curEl.videoHeight * ka.cropSh,
                }
              }
            } else {
              const ai = activeClip.item as ImageClass
              curEl = imageBitmaps.get(activeClip.id) || null
              if (curEl) {
                const ka = resolveMediaKeyframeTransform(ai, elapsedA, ai.duration)
                curParams = {
                  x: cr.x + ai.x * xScale,
                  y: cr.y + ai.y * yScale,
                  w: ai.width * xScale,
                  h: ai.height * yScale,
                  sx: curEl.width * ka.cropSx,
                  sy: curEl.height * ka.cropSy,
                  sw: curEl.width * ka.cropSw,
                  sh: curEl.height * ka.cropSh,
                }
              }
            }

            if (curEl && curParams) {
              const nextItem = nextClip.item
              const activeItem = activeClip.item
              const progB = calculateAnimationProgress(nextItem, newTime, nextClip.startTime)
              const progA = calculateAnimationProgress(activeItem, newTime, activeClip.startTime)
              const kn = nextClip.type === 'video'
                ? resolveMediaKeyframeTransform(nextItem as VideoClass, elapsedB, (nextItem as VideoClass).duration ?? 0)
                : resolveMediaKeyframeTransform(nextItem as ImageClass, elapsedB, (nextItem as ImageClass).duration)
              const ka = activeClip.type === 'video'
                ? resolveMediaKeyframeTransform(activeItem as VideoClass, elapsedA, (activeItem as VideoClass).duration ?? 0)
                : resolveMediaKeyframeTransform(activeItem as ImageClass, elapsedA, (activeItem as ImageClass).duration)
              applyZoomTransform(
              bufferCtx,
              nextItem.animation,
              nextItem.transition,
              transProgress,
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
              nextItem.transitionFlashMode,
              nextItem.transitionDirection,
              nextItem.transitionAxis,
              nextItem.transitionSlideEasing,
              nextItem.transitionCircleEasing
            )
              transActive = true
            }
          }
        }

        if (!transActive && backgroundDrawn) {
          if (activeClip) {
            if (activeClip.type === 'video') {
              const vEl = videoElements.get(activeClip.id)
              if (vEl && videoElementHasDrawableFrame(vEl)) {
                this.drawVideo(bufferCtx, cr, vEl, activeClip.item as VideoClass, newTime, isPlaying, persistenceCanvases, canvas)
              } else {
                this.drawMainImages(bufferCtx, cr, newTime, state.images, imageBitmaps)
              }
            } else {
              this.drawMainImages(bufferCtx, cr, newTime, state.images, imageBitmaps)
            }
          } else {
            this.drawMainImages(bufferCtx, cr, newTime, state.images, imageBitmaps)
          }
        }

        if (backgroundDrawn) {
          this.drawOverlays(bufferCtx, cr, newTime, state.images, state.videos, videoElements, imageBitmaps, isPlaying)
          
          // Optimization: Only filter/sort effects if they exist
          if (effects && effects.length > 0) {
            const activeEffects = effects
              .filter((eff) => newTime >= eff.startTime && newTime < eff.endTime)
              .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
            for (let i = 0; i < activeEffects.length; i++) {
              const eff = activeEffects[i]
              applyEffect(bufferCtx, eff.type, cr.x, cr.y, cr.width, cr.height, newTime, eff.intensity, eff.contrast)
            }
          }

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
    mainCanvas: HTMLCanvasElement
  ) {
    if (!videoElementHasDrawableFrame(videoEl)) return

    const logicalW = 1080
    const logicalH = 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    const drawX = cr.x + (videoClip.x ?? 0) * xScale
    const drawY = cr.y + (videoClip.y ?? 0) * yScale
    const drawWidth = (videoClip.width ?? logicalW) * xScale
    const drawHeight = (videoClip.height ?? logicalH) * yScale
    const progress = calculateAnimationProgress(videoClip, currentTime, videoClip.timestamp)
    const elapsed = Math.max(0, currentTime - videoClip.timestamp)
    const clipDur = videoClip.duration ?? 0
    const kf = resolveMediaKeyframeTransform(videoClip, elapsed, clipDur)
    const tmDraw = videoTimelineSourceMapping(videoClip, elapsed, clipDur)
    const x = tmDraw.playSpan > 0 ? Math.min(elapsed, tmDraw.playSpan) / tmDraw.playSpan : 1
    let f = x
    if (videoClip.speedEasing === 'ease') {
      f = 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3)
    }
    const instantaneousSpeed = (videoClip.speedStart ?? videoClip.playbackSpeed ?? 1) + 
      f * ((videoClip.speedEnd ?? videoClip.playbackSpeed ?? 1) - (videoClip.speedStart ?? videoClip.playbackSpeed ?? 1))

    // Determine if we should use motion blur
    // We only use it if:
    // 1. It's playing (not scrubbing)
    // 2. The speed is significantly different from 1.0 (e.g. > 1.2x or < 0.8x) OR it's ramping
    const isRamping = Math.abs((videoClip.speedStart ?? 1) - (videoClip.speedEnd ?? 1)) > 0.05
    const isFastOrSlow = Math.abs(instantaneousSpeed - 1) > 0.15
    const useMotionBlur = isPlaying && (isRamping || isFastOrSlow)

    // Dynamic Motion Blur / Persistence
    if (useMotionBlur) {
      let pCanvases = persistenceCanvases.get(videoClip.id)
      if (!pCanvases) {
        const current = document.createElement('canvas')
        const accumulation = document.createElement('canvas')
        current.width = mainCanvas.width; current.height = mainCanvas.height
        accumulation.width = mainCanvas.width; accumulation.height = mainCanvas.height
        pCanvases = { current, accumulation }
        persistenceCanvases.set(videoClip.id, pCanvases)
        
        // Initialize accumulation with the first frame
        const curCtx = current.getContext('2d', { alpha: true })!
        applyZoomTransform(curCtx, videoClip.animation, videoClip.transition, progress, videoEl, drawX, drawY, drawWidth, drawHeight, kf.cropSx, kf.cropSy, kf.cropSw, kf.cropSh, kf.zoomIntensity, videoClip.duration, videoClip.animationDuration, currentTime - videoClip.timestamp)
        
        const accCtx = accumulation.getContext('2d', { alpha: false })!
        accCtx.drawImage(current, 0, 0)
        
        ctx.drawImage(accumulation, 0, 0)
        fillCanvasGuttersOutsideContentRect(ctx, cr)
        return
      }

      const curCtx = pCanvases.current.getContext('2d', { alpha: true })!
      const accCtx = pCanvases.accumulation.getContext('2d', { alpha: false })!
      
      // 1. Calculate Velocity for Directional Blur
      const lastState = this.lastTransformStates.get(videoClip.id)
      let vx = 0, vy = 0
      if (lastState && isPlaying) {
        vx = (drawX - lastState.x)
        vy = (drawY - lastState.y)
      }
      this.lastTransformStates.set(videoClip.id, { x: drawX, y: drawY, w: drawWidth, h: drawHeight, time: currentTime })

      // 2. Sub-pixel Jitter (Temporal Anti-Aliasing)
      let jX = 0, jY = 0
      if (instantaneousSpeed < 0.3) {
        jX = (Math.random() - 0.5) * 0.5
        jY = (Math.random() - 0.5) * 0.5
      }

      // 3. Render Current Frame to Buffer
      curCtx.clearRect(0, 0, pCanvases.current.width, pCanvases.current.height)
      
      // Apply subtle directional blur only if moving fast
      const speedMag = Math.sqrt(vx * vx + vy * vy)
      if (speedMag > 1.0) {
        curCtx.filter = `blur(${Math.min(1.5, speedMag * 0.1)}px)`
      } else {
        curCtx.filter = 'none'
      }
      
      applyZoomTransform(curCtx, videoClip.animation, videoClip.transition, progress, videoEl, drawX + jX, drawY + jY, drawWidth, drawHeight, kf.cropSx, kf.cropSy, kf.cropSw, kf.cropSh, kf.zoomIntensity, videoClip.duration, videoClip.animationDuration, currentTime - videoClip.timestamp)
      curCtx.filter = 'none'

      // 4. Speed-Adaptive Alpha (Variable Shutter)
      let adaptiveAlpha = Math.max(0.3, Math.min(0.7, instantaneousSpeed * 0.5))
      if (!lastState) adaptiveAlpha = 1.0

      accCtx.save()
      accCtx.globalAlpha = adaptiveAlpha
      accCtx.drawImage(pCanvases.current, 0, 0)
      accCtx.restore()

      // 5. Final Output Filter (High-Pass Sharpening)
      if (instantaneousSpeed < 0.5) {
        ctx.filter = 'contrast(1.02) brightness(1.01)'
      }
      ctx.drawImage(pCanvases.accumulation, 0, 0)
      ctx.filter = 'none'
      fillCanvasGuttersOutsideContentRect(ctx, cr)
    } else {
      // Normal playback without expensive motion blur
      this.lastTransformStates.delete(videoClip.id)
      applyZoomTransform(ctx, videoClip.animation, videoClip.transition, progress, videoEl, drawX, drawY, drawWidth, drawHeight, kf.cropSx, kf.cropSy, kf.cropSw, kf.cropSh, kf.zoomIntensity, videoClip.duration, videoClip.animationDuration, currentTime - videoClip.timestamp, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, videoClip.transitionColor, videoClip.transitionFlashMode, videoClip.transitionDirection, videoClip.transitionAxis, videoClip.transitionSlideEasing, videoClip.transitionCircleEasing)
    }
  }

  private drawMainImages(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    currentTime: number,
    images: ImageClass[],
    imageBitmaps: Map<string, ImageBitmap>
  ) {
    const mainTrackImages = images.filter(img => (img as any).row === 0)
    let visibleImages = mainTrackImages.filter(img => currentTime >= img.startTime && currentTime < img.endTime)
    if (visibleImages.length === 0) {
      const lastEnded = mainTrackImages.filter(img => img.endTime <= currentTime).sort((a, b) => b.endTime - a.endTime)[0]
      if (lastEnded) visibleImages = [lastEnded]
    }
    const logicalW = 1080
    const logicalH = 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    visibleImages.forEach((image) => {
      let bitmap = imageBitmaps.get(image.id)
      if (!bitmap) {
        const lastEnded = mainTrackImages.filter(i => i.endTime <= image.startTime).sort((a, b) => b.endTime - a.endTime)[0]
        if (lastEnded) {
          const prevBitmap = imageBitmaps.get(lastEnded.id)
          if (prevBitmap) {
            const kLast = resolveMediaKeyframeTransform(lastEnded, lastEnded.duration, lastEnded.duration)
            const dx = cr.x + (image.x ?? 0) * xScale
            const dy = cr.y + (image.y ?? 0) * yScale
            const dw = (image.width ?? logicalW) * xScale
            const dh = (image.height ?? logicalH) * yScale
            ctx.save(); ctx.globalAlpha = image.opacity
            runWithPlacementRotation(ctx, dx, dy, dw, dh, image.rotation, (ox, oy) => {
              applyZoomTransform(ctx, 'none', 'none', 0, prevBitmap, ox, oy, dw, dh, kLast.cropSx, kLast.cropSy, kLast.cropSw, kLast.cropSh, 0, undefined, 0, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing)
            })
            ctx.restore()
            return
          }
        }
      }
      if (!bitmap) return
      const progress = calculateAnimationProgress(image, currentTime, image.startTime)
      const kImg = resolveMediaKeyframeTransform(image, currentTime - image.startTime, image.duration)
      const dx = cr.x + (image.x ?? 0) * xScale
      const dy = cr.y + (image.y ?? 0) * yScale
      const dw = (image.width ?? logicalW) * xScale
      const dh = (image.height ?? logicalH) * yScale
      ctx.save(); ctx.globalAlpha = image.opacity
      runWithPlacementRotation(ctx, dx, dy, dw, dh, image.rotation, (ox, oy) => {
        applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, ox, oy, dw, dh, kImg.cropSx, kImg.cropSy, kImg.cropSw, kImg.cropSh, kImg.zoomIntensity, image.duration, image.animationDuration, currentTime - image.startTime, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing)
      })
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
    isPlaying: boolean
  ) {
    const logicalW = 1080
    const logicalH = 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    type OverlayEntry =
      | { kind: 'image'; row: number; t0: number; image: ImageClass }
      | { kind: 'video'; row: number; t0: number; video: VideoClass }
    const entries: OverlayEntry[] = []
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      if (image.row <= 0 || currentTime < image.startTime || currentTime >= image.endTime) continue
      entries.push({ kind: 'image', row: image.row, t0: image.startTime, image })
    }
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      if (!video.isOverlay) continue
      const dur = video.duration ?? 0
      if (dur <= 0 || currentTime < video.timestamp || currentTime >= video.timestamp + dur) continue
      entries.push({ kind: 'video', row: video.row, t0: video.timestamp, video })
    }
    entries.sort((a, b) => a.row - b.row || a.t0 - b.t0)
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.kind === 'image') {
        const image = e.image
        const bitmap = imageBitmaps.get(image.id)
        if (!bitmap) continue
        const progress = calculateAnimationProgress(image, currentTime, image.startTime)
        const kOvImg = resolveMediaKeyframeTransform(image, currentTime - image.startTime, image.duration)
        const ox = cr.x + (image.x ?? 0) * xScale
        const oy = cr.y + (image.y ?? 0) * yScale
        const ow = (image.width ?? logicalW) * xScale
        const oh = (image.height ?? logicalH) * yScale
        ctx.save(); ctx.globalAlpha = image.opacity
        runWithPlacementRotation(ctx, ox, oy, ow, oh, image.rotation, (px, py) => {
          applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, px, py, ow, oh, kOvImg.cropSx, kOvImg.cropSy, kOvImg.cropSw, kOvImg.cropSh, kOvImg.zoomIntensity, image.duration, image.animationDuration, currentTime - image.startTime, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing)
        })
        ctx.restore()
      } else {
        const video = e.video
        const elapsed = currentTime - video.timestamp
        const vEl = videoElements.get(video.id)
        if (!vEl || !videoElementHasDrawableFrame(vEl)) continue
        const progress = calculateAnimationProgress(video, currentTime, video.timestamp)
        const kOvVid = resolveMediaKeyframeTransform(video, elapsed, video.duration ?? 0)
        ctx.save(); ctx.globalAlpha = video.opacity
        applyZoomTransform(ctx, video.animation, video.transition, progress, vEl, cr.x + video.x * xScale, cr.y + video.y * yScale, video.width * xScale, video.height * yScale, kOvVid.cropSx, kOvVid.cropSy, kOvVid.cropSw, kOvVid.cropSh, kOvVid.zoomIntensity, video.duration, video.animationDuration, currentTime - video.timestamp, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, video.transitionColor, video.transitionFlashMode, video.transitionDirection, video.transitionAxis, video.transitionSlideEasing, video.transitionCircleEasing)
        ctx.restore()
      }
    }
  }
}
