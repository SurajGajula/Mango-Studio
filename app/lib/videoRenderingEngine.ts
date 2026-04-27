import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { EffectClass } from '@/app/models/EffectClass'
import {
  MainItem,
  calculateAnimationProgress,
  clipTimelineSpanForSourceMap,
  videoTimelineSourceMapping,
  getSortedRowItems,
  findActiveAndNextItems,
  checkTransition,
  renderClipTransitionPair,
} from '@/app/lib/renderUtils'
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
  private frameStallCount: number = 0

  public render(
    canvas: HTMLCanvasElement,
    cr: { x: number; y: number; width: number; height: number },
    state: RenderState,
    resources: RenderResources,
    onVideoTimeUpdate: (id: string, time: number) => void,
    onVideoPlayState: (id: string, playing: boolean, rate: number) => void
  ) {
    const { playbackTime: newTime, isPlaying, playbackRate: rate, effects } = state
    const { videoElements, imageBitmaps, bufferCanvas, persistenceCanvases } = resources

    const allRows = new Set<number>()
    for (let i = 0; i < state.videos.length; i++) {
      const rr = state.videos[i].row
      if (rr >= 0) allRows.add(rr)
    }
    for (let i = 0; i < state.images.length; i++) {
      const rr = state.images[i].row
      if (rr >= 0) allRows.add(rr)
    }
    const rowTransitionByRow = new Map<
      number,
      { active: MainItem; next: MainItem; transitionActive: boolean; transProgress: number }
    >()
    for (const row of allRows) {
      const sortedR = getSortedRowItems(row, state.videos, state.images)
      const pr = findActiveAndNextItems(sortedR, newTime)
      const tr = checkTransition(pr.activeItem, pr.nextItem, newTime)
      if (pr.activeItem && pr.nextItem && tr.transitionActive) {
        rowTransitionByRow.set(row, {
          active: pr.activeItem,
          next: pr.nextItem,
          transitionActive: tr.transitionActive,
          transProgress: tr.progress,
        })
      }
    }

    if (!bufferCanvas) return

    const bufferCtx = bufferCanvas.getContext('2d', { alpha: false })!
    const visibleCtx = canvas.getContext('2d', { alpha: false })!

    const videoVisualKey = state.videos
      .map((video) =>
        [
          video.id,
          video.url,
          video.sourceUrl,
          video.timestamp,
          video.duration,
          video.x,
          video.y,
          video.width,
          video.height,
          video.cropAspect,
          video.cropSx,
          video.cropSy,
          video.cropSw,
          video.cropSh,
          video.opacity,
          video.row,
          video.animation,
          video.transition,
          video.transitionDuration,
          video.animationDuration,
          video.animationZoomEasing,
          video.transitionColor,
          video.transitionFlashMode,
          video.transitionDirection,
          video.transitionAxis,
          video.transitionSlideEasing,
          video.transitionCircleEasing,
          video.zoomIntensity,
          video.zoomDistanceIntensity,
        ].join('|')
      )
      .join('~')
    const imageVisualKey = state.images
      .map((image) =>
        [
          image.id,
          image.url,
          image.startTime,
          image.endTime,
          image.x,
          image.y,
          image.width,
          image.height,
          image.cropAspect,
          image.cropSx,
          image.cropSy,
          image.cropSw,
          image.cropSh,
          image.opacity,
          image.row,
          image.animation,
          image.transition,
          image.transitionDuration,
          image.animationDuration,
          image.animationZoomEasing,
          image.transitionColor,
          image.transitionFlashMode,
          image.transitionDirection,
          image.transitionAxis,
          image.transitionSlideEasing,
          image.transitionCircleEasing,
          image.zoomIntensity,
          image.zoomDistanceIntensity,
          image.rotation,
        ].join('|')
      )
      .join('~')
    const effectsKey = effects
      .map((effect) =>
        [effect.id, effect.type, effect.startTime, effect.endTime, effect.row, effect.intensity, effect.contrast, effect.flashSpeed].join('|')
      )
      .join('~')
    const stateKey = `${cr.width}-${cr.height}-${videoVisualKey}-${imageVisualKey}-${effectsKey}`
    const stateChanged = stateKey !== this.lastStateKey
    const timeChanged = Math.abs(newTime - this.lastRenderedTime) > 0.001
    const shouldSwap = isPlaying || stateChanged

    if (shouldSwap || timeChanged) {
      for (let i = 0; i < state.videos.length; i++) {
        const video = state.videos[i]
        const vEl = videoElements.get(video.id)
        if (!vEl) continue
        const span = video.duration ?? 0
        const inRange = span > 0 && newTime >= video.timestamp && newTime < video.timestamp + span
        const elapsed = Math.max(0, newTime - video.timestamp)
        const vDur = clipTimelineSpanForSourceMap(video.duration)
        const tmV = videoTimelineSourceMapping(video, elapsed, vDur)
        const target = (video.trimStart ?? 0) + tmV.sourceElapsed

        let prewarm = false
        let freezeAtFirst = false
        const rowTrans = rowTransitionByRow.get(video.row)
        if (rowTrans && rowTrans.next.type === 'video' && rowTrans.next.id === video.id) {
          const timeUntilNext = rowTrans.next.startTime - newTime
          prewarm = rowTrans.transitionActive || (timeUntilNext > 0 && timeUntilNext < 1.0)
          freezeAtFirst = rowTrans.transitionActive && rowTrans.transProgress < 1
        }

        if (inRange || prewarm) {
          if (isPlaying && !freezeAtFirst) {
            const drift = Math.abs(vEl.currentTime - target)
            if (drift > 0.22) {
              vEl.currentTime = target
              onVideoTimeUpdate(video.id, target)
            }
            if (tmV.inHold) {
              if (!vEl.paused) onVideoPlayState(video.id, false, 1)
            } else {
              const x = tmV.playSpan > 0 ? Math.min(elapsed, tmV.playSpan) / tmV.playSpan : 1
              const f = video.speedEasing === 'ease' ? 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3) : x
              const inst =
                (video.speedStart ?? video.playbackSpeed ?? 1) +
                f * ((video.speedEnd ?? video.playbackSpeed ?? 1) - (video.speedStart ?? video.playbackSpeed ?? 1))
              onVideoPlayState(video.id, true, rate * inst)
            }
          } else {
            if (!vEl.paused) onVideoPlayState(video.id, false, 1)
            if (Math.abs(vEl.currentTime - target) > PAUSED_SCRUB_SEEK_THRESHOLD) {
              vEl.currentTime = target
              onVideoTimeUpdate(video.id, target)
            }
          }
        } else {
          if (!vEl.paused) onVideoPlayState(video.id, false, 1)
        }
      }

      // 3. Render to Buffer
      if (shouldSwap || timeChanged) {
        bufferCtx.fillStyle = PREVIEW_CHROME_FILL
        bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height)
        bufferCtx.fillStyle = '#000000'
        bufferCtx.fillRect(cr.x, cr.y, cr.width, cr.height)
        {
          this.drawOverlays(
            bufferCtx,
            cr,
            newTime,
            state.images,
            state.videos,
            videoElements,
            imageBitmaps,
            isPlaying,
            rowTransitionByRow
          )
          
          // Optimization: Only filter/sort effects if they exist
          if (effects && effects.length > 0) {
            const activeEffects = effects
              .filter((eff) => newTime >= eff.startTime && newTime < eff.endTime)
              .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
            for (let i = 0; i < activeEffects.length; i++) {
              const eff = activeEffects[i]
              applyEffect(
                bufferCtx,
                eff.type,
                cr.x,
                cr.y,
                cr.width,
                cr.height,
                newTime,
                eff.intensity,
                eff.contrast,
                eff.flashSpeed
              )
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

  private drawOverlays(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    currentTime: number,
    images: ImageClass[],
    videos: VideoClass[],
    videoElements: Map<string, HTMLVideoElement>,
    imageBitmaps: Map<string, ImageBitmap>,
    isPlaying: boolean,
    rowTransitionByRow: Map<
      number,
      { active: MainItem; next: MainItem; transitionActive: boolean; transProgress: number }
    >
  ) {
    const logicalW = 1080
    const logicalH = 1920
    const xScale = cr.width / logicalW; const yScale = cr.height / logicalH
    const skipOverlayIds = new Set<string>()
    rowTransitionByRow.forEach((rts) => {
      if (!rts.transitionActive || rts.transProgress >= 1) return
      if (
        renderClipTransitionPair(ctx, cr, currentTime, rts.active, rts.next, rts.transProgress, (id) => {
          const el = videoElements.get(id)
          return el instanceof HTMLVideoElement ? el : undefined
        }, (id) => imageBitmaps.get(id) ?? undefined)
      ) {
        skipOverlayIds.add(rts.active.id)
        skipOverlayIds.add(rts.next.id)
      }
    })
    type OverlayEntry =
      | { kind: 'image'; row: number; t0: number; image: ImageClass }
      | { kind: 'video'; row: number; t0: number; video: VideoClass }
    const entries: OverlayEntry[] = []
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      if (image.row < 0 || currentTime < image.startTime || currentTime >= image.endTime) continue
      entries.push({ kind: 'image', row: image.row, t0: image.startTime, image })
    }
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      if (video.row < 0) continue
      const dur = video.duration ?? 0
      if (dur <= 0 || currentTime < video.timestamp || currentTime >= video.timestamp + dur) continue
      entries.push({ kind: 'video', row: video.row, t0: video.timestamp, video })
    }
    entries.sort((a, b) => a.row - b.row || a.t0 - b.t0)
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.kind === 'image' && skipOverlayIds.has(e.image.id)) continue
      if (e.kind === 'video' && skipOverlayIds.has(e.video.id)) continue
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
          applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, px, py, ow, oh, kOvImg.cropSx, kOvImg.cropSy, kOvImg.cropSw, kOvImg.cropSh, kOvImg.zoomIntensity, image.duration, image.animationDuration, currentTime - image.startTime, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing, image.animationZoomEasing, undefined, image.zoomDistanceIntensity, undefined)
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
        applyZoomTransform(ctx, video.animation, video.transition, progress, vEl, cr.x + video.x * xScale, cr.y + video.y * yScale, video.width * xScale, video.height * yScale, kOvVid.cropSx, kOvVid.cropSy, kOvVid.cropSw, kOvVid.cropSh, kOvVid.zoomIntensity, video.duration, video.animationDuration, currentTime - video.timestamp, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, video.transitionColor, video.transitionFlashMode, video.transitionDirection, video.transitionAxis, video.transitionSlideEasing, video.transitionCircleEasing, video.animationZoomEasing, undefined, video.zoomDistanceIntensity, undefined)
        ctx.restore()
      }
    }
  }
}
