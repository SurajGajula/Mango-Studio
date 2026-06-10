import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { EffectClass } from '@/app/models/EffectClass'
import {
  MainItem,
  calculateAnimationProgress,
  clipTimelineSpanForSourceMap,
  videoTimelineSourceMapping,
  videoInstantaneousPlaybackSpeed,
  getSortedRowItems,
  findActiveAndNextItems,
  checkTransition,
  renderClipTransitionPair,
} from '@/app/lib/renderUtils'
import { manifestVideoTimelineSpanSeconds } from '@/app/lib/timeUtils'
import {
  findAdjacentSameSourcePredecessor,
  isVideoActiveAtTimelineTime,
  videoElapsedForMapping,
} from '@/app/lib/adjacentSplitVideo'
import {
  videoEffectiveSourceSpanSeconds,
  videoPlaybackTrimEnd,
  videoSourceTrimBase,
} from '@/app/lib/videoPlaybackSource'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { runWithPlacementRotation } from '@/app/lib/placementRotation'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyEffect } from '@/app/lib/applyEffect'
import { drawTextOverlay } from '@/app/lib/drawTextOverlay'
import {
  primePreviewVideoFrame,
  resolvePreviewVideoDrawSource,
  schedulePreviewVideoFrameCapture,
} from '@/app/lib/previewVideoFrameCache'

export interface RenderState {
  playbackTime: number
  isPlaying: boolean
  playbackRate: number
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  effects: EffectClass[]
}

export interface RenderResources {
  videoElements: Map<string, HTMLVideoElement>
  imageBitmaps: Map<string, ImageBitmap>
  bufferCanvas: HTMLCanvasElement | null
  persistenceCanvases: Map<string, { current: HTMLCanvasElement; accumulation: HTMLCanvasElement }>
}

const PAUSED_SCRUB_SEEK_THRESHOLD = 0.16
const PLAYBACK_SEEK_SYNC_THRESHOLD = 0.02
const PLAYBACK_DRIFT_RESYNC_SEC = 0.2
const PREWARM_LEAD_SEC = 10
const PREWARM_LEAD_SEC_MANY_CLIPS = 3
const MANY_TIMELINE_VIDEOS = 3
const PREVIEW_CHROME_FILL = '#0f0f0f'

const previewVideoPrimeAwaitSeeked = new WeakSet<HTMLVideoElement>()

function clampVideoSeekTime(el: HTMLVideoElement, requestedTime: number): number {
  if (!Number.isFinite(requestedTime)) return 0
  const clampedMin = Math.max(0, requestedTime)
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0) return quantizeTimelineSeconds(clampedMin)
  return quantizeTimelineSeconds(Math.min(clampedMin, Math.max(0, duration - 0.04)))
}

function clampVideoSourceSeekTime(
  video: VideoClass,
  el: HTMLVideoElement,
  requestedTime: number
): number {
  if (!Number.isFinite(requestedTime)) return quantizeTimelineSeconds(videoSourceTrimBase(video))
  const trimStart = quantizeTimelineSeconds(videoSourceTrimBase(video))
  const spanLimit = videoEffectiveSourceSpanSeconds(video, el)
  if (spanLimit > 0) {
    const maxT = trimStart + Math.max(0, spanLimit - 0.001)
    return quantizeTimelineSeconds(Math.max(trimStart, Math.min(requestedTime, maxT)))
  }
  return clampVideoSeekTime(el, requestedTime)
}

function videoElementHasDecodedFrame(el: HTMLVideoElement): boolean {
  if (el.videoWidth <= 0 || el.videoHeight <= 0) return false
  return el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

function previewVideoPrimeSeekTime(el: HTMLVideoElement, clampedTarget: number): number | null {
  if (!Number.isFinite(clampedTarget)) return null
  const dur = el.duration
  if (Number.isFinite(dur) && dur > 0) {
    const maxT = Math.max(0, dur - 0.04)
    const headroom = maxT - clampedTarget
    if (headroom > 1e-4) {
      const step = Math.min(1 / 120, headroom * 0.5)
      return clampVideoSeekTime(el, clampedTarget + Math.max(1e-4, step))
    }
    return null
  }
  // If duration isn't known yet, we can't safely clamp; still try a tiny forward seek
  // so the decoder produces frame 0 for canvas draw.
  const candidate = clampedTarget + 1 / 120
  return candidate > clampedTarget ? Math.max(0, candidate) : null
}

function applyPausedPreviewVideoSync(
  vEl: HTMLVideoElement,
  clampedTarget: number,
  onUpdate: (t: number) => void
) {
  if (vEl.seeking) return
  const drift = Math.abs(vEl.currentTime - clampedTarget)
  const hasFrame = videoElementHasDecodedFrame(vEl)
  if (hasFrame) {
    previewVideoPrimeAwaitSeeked.delete(vEl)
  }
  if (!hasFrame) {
    if (previewVideoPrimeAwaitSeeked.has(vEl)) {
      return
    }
    const prime = previewVideoPrimeSeekTime(vEl, clampedTarget)
    if (prime !== null && Math.abs(prime - clampedTarget) > 1e-6) {
      previewVideoPrimeAwaitSeeked.add(vEl)
      const exact = clampedTarget
      const onSeeked = () => {
        vEl.removeEventListener('seeked', onSeeked)
        previewVideoPrimeAwaitSeeked.delete(vEl)
        vEl.currentTime = exact
        onUpdate(exact)
      }
      vEl.addEventListener('seeked', onSeeked, { once: true })
      vEl.currentTime = prime
      onUpdate(prime)
      return
    }
    vEl.currentTime = clampedTarget
    onUpdate(clampedTarget)
    return
  }
  if (drift > PAUSED_SCRUB_SEEK_THRESHOLD) {
    vEl.currentTime = clampedTarget
    onUpdate(clampedTarget)
  }
}

function seekPreviewVideoIfDrift(
  vEl: HTMLVideoElement,
  clampedTarget: number,
  threshold: number,
  onUpdate: (t: number) => void
) {
  if (vEl.seeking) return
  const drift = Math.abs(vEl.currentTime - clampedTarget)
  if (drift > threshold) {
    vEl.currentTime = clampedTarget
    onUpdate(clampedTarget)
  }
}

function syncPreviewVideoToTimeline(
  vEl: HTMLVideoElement,
  clampedTarget: number,
  onUpdate: (t: number) => void,
  seekThreshold = PAUSED_SCRUB_SEEK_THRESHOLD
) {
  if (vEl.seeking) return
  if (!videoElementHasDecodedFrame(vEl)) {
    applyPausedPreviewVideoSync(vEl, clampedTarget, onUpdate)
    return
  }
  seekPreviewVideoIfDrift(vEl, clampedTarget, seekThreshold, onUpdate)
}

function resolveOverlayVideoDrawSource(
  vEl: HTMLVideoElement,
  sameVideoHold: HTMLCanvasElement | undefined,
  fallbackHold: HTMLCanvasElement | undefined
): HTMLVideoElement | HTMLCanvasElement | null {
  if (!vEl.seeking && videoElementHasDecodedFrame(vEl)) {
    return vEl
  }
  if (sameVideoHold) {
    return sameVideoHold
  }
  if (fallbackHold) {
    return fallbackHold
  }
  return null
}

function isActiveMorphVideo(
  videoId: string,
  rowTrans:
    | { active: MainItem; next: MainItem; transitionActive: boolean; transProgress: number }
    | undefined
): boolean {
  return !!(
    rowTrans &&
    rowTrans.transitionActive &&
    rowTrans.transProgress < 1 &&
    rowTrans.next.item.transition === 'morph' &&
    (rowTrans.active.id === videoId || rowTrans.next.id === videoId)
  )
}

function prewarmLeadForTimeline(videoCount: number): number {
  return videoCount > MANY_TIMELINE_VIDEOS ? PREWARM_LEAD_SEC_MANY_CLIPS : PREWARM_LEAD_SEC
}

export class VideoRenderingEngine {
  private lastRenderedTime: number = -1
  private lastStateKey: string = ''
  private frameStallCount: number = 0
  private cachedVideos: VideoClass[] | null = null
  private cachedVideoVisualKey = ''
  private cachedImages: ImageClass[] | null = null
  private cachedImageVisualKey = ''
  private cachedTexts: TextClass[] | null = null
  private cachedTextVisualKey = ''
  private cachedEffects: EffectClass[] | null = null
  private cachedEffectsKey = ''
  private videoHoldFrame = new Map<string, HTMLCanvasElement>()
  private lastVideoVisualKeyForHold = ''

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

    const videoVisualKey = this.getVideoVisualKey(state.videos)
    if (videoVisualKey !== this.lastVideoVisualKeyForHold) {
      this.videoHoldFrame.clear()
      this.lastVideoVisualKeyForHold = videoVisualKey
    }
    const imageVisualKey = this.getImageVisualKey(state.images)
    const textVisualKey = this.getTextVisualKey(state.texts)
    const effectsKey = this.getEffectsKey(effects)
    const imageRuntimeKey = state.images
      .map((image) => {
        const active = image.row >= 0 && newTime >= image.startTime && newTime < image.endTime
        if (!active) return `${image.id}:out`
        const bitmap = imageBitmaps.get(image.id)
        if (!bitmap) return `${image.id}:missing`
        return `${image.id}:ready:${bitmap.width}x${bitmap.height}`
      })
      .join('~')
    const stateKey = `${cr.width}-${cr.height}-${videoVisualKey}-${imageVisualKey}-${textVisualKey}-${effectsKey}-${imageRuntimeKey}`
    const prewarmLead = prewarmLeadForTimeline(state.videos.length)

    for (let i = 0; i < state.videos.length; i++) {
      const video = state.videos[i]
      const vEl = videoElements.get(video.id)
      if (!vEl) continue

      const span = manifestVideoTimelineSpanSeconds(video)
      const inRange = span > 0 && isVideoActiveAtTimelineTime(video, state.videos, newTime)

      let prewarm = false
      const rowTrans = rowTransitionByRow.get(video.row)
      if (rowTrans && rowTrans.next.type === 'video' && rowTrans.next.id === video.id) {
        const timeUntilNext = rowTrans.next.startTime - newTime
        const transDur = Math.max(0.1, rowTrans.next.item.transitionDuration ?? 1.0)
        prewarm = rowTrans.transitionActive || (timeUntilNext > 0 && timeUntilNext <= transDur + 0.5)
      }
      if (
        !prewarm &&
        span > 0 &&
        video.row >= 0 &&
        newTime < video.timestamp &&
        video.timestamp - newTime <= prewarmLead
      ) {
        prewarm = true
      }

      if (!inRange && !prewarm) {
        if (!vEl.paused) onVideoPlayState(video.id, false, 1)
        continue
      }

      const elapsed = videoElapsedForMapping(video, newTime)
      const vDur = clipTimelineSpanForSourceMap(span)
      const tmV = videoTimelineSourceMapping(video, elapsed, vDur)
      const sourceSpan = videoEffectiveSourceSpanSeconds(video, vEl)
      const cappedSourceElapsed = Math.min(tmV.sourceElapsed, sourceSpan)
      const target = videoSourceTrimBase(video) + cappedSourceElapsed
      const clampedTarget = clampVideoSourceSeekTime(video, vEl, target)
      const onVideoUpdate = (t: number) => onVideoTimeUpdate(video.id, t)
      const decodeOnlyPrewarm = prewarm && !inRange
      const morphSync = isActiveMorphVideo(video.id, rowTrans)
      const seekThreshold =
        isPlaying && inRange && !decodeOnlyPrewarm && !morphSync && !video.reversed && !tmV.inHold
          ? PLAYBACK_SEEK_SYNC_THRESHOLD
          : PAUSED_SCRUB_SEEK_THRESHOLD
      const useNativePlayback =
        isPlaying &&
        inRange &&
        !decodeOnlyPrewarm &&
        !morphSync &&
        !video.reversed &&
        !tmV.inHold

      if (useNativePlayback) {
        const instSpeed = videoInstantaneousPlaybackSpeed(video, elapsed, span)
        const targetRate = rate * instSpeed
        if (Math.abs(vEl.playbackRate - targetRate) > 0.01) {
          vEl.playbackRate = targetRate
        }
        const drift = Math.abs(vEl.currentTime - clampedTarget)
        if (!vEl.seeking && drift > PLAYBACK_DRIFT_RESYNC_SEC) {
          vEl.currentTime = clampedTarget
          onVideoUpdate(clampedTarget)
        }
        if (vEl.paused) {
          if (!vEl.seeking && drift > PLAYBACK_SEEK_SYNC_THRESHOLD) {
            vEl.currentTime = clampedTarget
            onVideoUpdate(clampedTarget)
          }
          const p = vEl.play()
          if (p) p.catch(() => {})
        }
        schedulePreviewVideoFrameCapture(vEl)
      } else {
        if (!vEl.paused) onVideoPlayState(video.id, false, 1)
        if (!vEl.seeking) {
          syncPreviewVideoToTimeline(vEl, clampedTarget, onVideoUpdate, seekThreshold)
        }
        primePreviewVideoFrame(vEl)
      }
    }

    bufferCtx.fillStyle = PREVIEW_CHROME_FILL
    bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height)
    bufferCtx.fillStyle = '#000000'
    bufferCtx.fillRect(cr.x, cr.y, cr.width, cr.height)
    this.drawOverlays(
      bufferCtx,
      cr,
      newTime,
      state.images,
      state.videos,
      state.texts,
      videoElements,
      imageBitmaps,
      isPlaying,
      rowTransitionByRow
    )

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
      bufferCtx.save()
      bufferCtx.fillStyle = 'rgba(255, 0, 0, 0.3)'
      bufferCtx.fillRect(cr.x, cr.y, 4, 20)
      bufferCtx.restore()
    }

    visibleCtx.drawImage(bufferCanvas, 0, 0)
    this.lastStateKey = stateKey
    this.lastRenderedTime = newTime
  }

  private getVideoVisualKey(videos: VideoClass[]): string {
    if (videos === this.cachedVideos) return this.cachedVideoVisualKey
    this.cachedVideos = videos
    this.cachedVideoVisualKey = videos
      .map((video) =>
        [
          video.id,
          video.url,
          video.sourceUrl,
          video.timestamp,
          video.duration,
          video.trimStart,
          video.trimEnd,
          video.sourceUrl,
          video.sourceTrimStart,
          video.sourceDuration,
          video.playbackSpeed,
          video.speedStart,
          video.speedEnd,
          video.speedEasing,
          video.reversed,
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
          video.transitionWipeEasing,
          video.zoomIntensity,
          video.zoomDistanceIntensity,
          video.flipHorizontal,
          video.flipVertical,
        ].join('|')
      )
      .join('~')
    return this.cachedVideoVisualKey
  }

  private getImageVisualKey(images: ImageClass[]): string {
    if (images === this.cachedImages) return this.cachedImageVisualKey
    this.cachedImages = images
    this.cachedImageVisualKey = images
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
          image.transitionWipeEasing,
          image.zoomIntensity,
          image.zoomDistanceIntensity,
          image.rotation,
          image.flipHorizontal,
          image.flipVertical,
        ].join('|')
      )
      .join('~')
    return this.cachedImageVisualKey
  }

  private getTextVisualKey(texts: TextClass[]): string {
    if (texts === this.cachedTexts) return this.cachedTextVisualKey
    this.cachedTexts = texts
    this.cachedTextVisualKey = texts
      .map((text) =>
        [
          text.id,
          text.content,
          text.startTime,
          text.endTime,
          text.x,
          text.y,
          text.width,
          text.fontSize,
          text.color,
          text.fontWeight,
          text.textAlign,
          text.fontFamily,
          text.opacity,
          text.style,
          text.animation,
          text.row,
        ].join('|')
      )
      .join('~')
    return this.cachedTextVisualKey
  }

  private getEffectsKey(effects: EffectClass[]): string {
    if (effects === this.cachedEffects) return this.cachedEffectsKey
    this.cachedEffects = effects
    this.cachedEffectsKey = effects
      .map((effect) =>
        [effect.id, effect.type, effect.startTime, effect.endTime, effect.row, effect.intensity, effect.contrast, effect.flashSpeed].join('|')
      )
      .join('~')
    return this.cachedEffectsKey
  }

  private drawOverlays(
    ctx: CanvasRenderingContext2D,
    cr: { x: number; y: number; width: number; height: number },
    currentTime: number,
    images: ImageClass[],
    videos: VideoClass[],
    texts: TextClass[],
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
    const skippedOverlayIdsByRow = new Map<number, Set<string>>()
    const videoById = new Map(videos.map((video) => [video.id, video]))
    type OverlayEntry =
      | { kind: 'image'; row: number; t0: number; image: ImageClass }
      | { kind: 'video'; row: number; t0: number; video: VideoClass }
      | { kind: 'text'; row: number; t0: number; text: TextClass }
    const entries: OverlayEntry[] = []
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      if (image.row < 0 || currentTime < image.startTime || currentTime >= image.endTime) continue
      entries.push({ kind: 'image', row: image.row, t0: image.startTime, image })
    }
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      if (video.row < 0) continue
      const span = manifestVideoTimelineSpanSeconds(video)
      if (span <= 0 || !isVideoActiveAtTimelineTime(video, videos, currentTime)) continue
      entries.push({ kind: 'video', row: video.row, t0: video.timestamp, video })
    }
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      if (text.row < 0 || currentTime < text.startTime || currentTime >= text.endTime) continue
      entries.push({ kind: 'text', row: text.row, t0: text.startTime, text })
    }
    entries.sort((a, b) => a.row - b.row || a.t0 - b.t0)
    const entriesByRow = new Map<number, OverlayEntry[]>()
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const list = entriesByRow.get(entry.row) ?? []
      list.push(entry)
      entriesByRow.set(entry.row, list)
    }

    const rows = Array.from(
      new Set<number>([
        ...Array.from(entriesByRow.keys()),
        ...Array.from(rowTransitionByRow.keys()),
      ])
    ).sort((a, b) => a - b)

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const transitionState = rowTransitionByRow.get(row)
      if (transitionState && transitionState.transitionActive && transitionState.transProgress < 1) {
        const rendered = renderClipTransitionPair(
          ctx,
          cr,
          currentTime,
          transitionState.active,
          transitionState.next,
          transitionState.transProgress,
          (id) => {
            const el = videoElements.get(id)
            return el instanceof HTMLVideoElement ? el : undefined
          },
          (id) => imageBitmaps.get(id) ?? undefined,
          (id, el) => {
            const video = videoById.get(id)
            const predecessor = video ? findAdjacentSameSourcePredecessor(videos, video) : null
            const predecessorHold = predecessor ? this.videoHoldFrame.get(predecessor.id) : undefined
            return resolveOverlayVideoDrawSource(el, this.videoHoldFrame.get(id), predecessorHold)
          }
        )
        if (rendered) {
          skippedOverlayIdsByRow.set(
            row,
            new Set<string>([transitionState.active.id, transitionState.next.id])
          )
        }
      }

      const rowEntries = entriesByRow.get(row) ?? []
      const skippedIds = skippedOverlayIdsByRow.get(row)
      for (let i = 0; i < rowEntries.length; i++) {
        const e = rowEntries[i]
        if (e.kind === 'image' && skippedIds?.has(e.image.id)) continue
        if (e.kind === 'video' && skippedIds?.has(e.video.id)) continue
        if (e.kind === 'image') {
          const image = e.image
          const bitmap = imageBitmaps.get(image.id)
          if (!bitmap) continue
          const progress = calculateAnimationProgress(image, currentTime, image.startTime)
          const kOvImg = resolveMediaKeyframeTransform(image, currentTime - image.startTime, image.duration)
          const ox = cr.x + kOvImg.x * xScale
          const oy = cr.y + kOvImg.y * yScale
          const ow = kOvImg.width * xScale
          const oh = kOvImg.height * yScale
          ctx.save()
          ctx.globalAlpha = image.opacity
          runWithPlacementRotation(ctx, ox, oy, ow, oh, image.rotation, (px, py) => {
            applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, px, py, ow, oh, kOvImg.cropSx, kOvImg.cropSy, kOvImg.cropSw, kOvImg.cropSh, kOvImg.zoomIntensity, image.duration, image.animationDuration, currentTime - image.startTime, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing, image.transitionWipeEasing, image.animationZoomEasing, undefined, image.zoomDistanceIntensity, undefined)
          }, image.flipHorizontal, image.flipVertical)
          ctx.restore()
        } else if (e.kind === 'video') {
          const video = e.video
          const span = manifestVideoTimelineSpanSeconds(video)
          const elapsed = videoElapsedForMapping(video, currentTime)
          const vEl = videoElements.get(video.id)
          if (!vEl) continue
          const predecessor = findAdjacentSameSourcePredecessor(videos, video)
          const predecessorHold = predecessor ? this.videoHoldFrame.get(predecessor.id) : undefined
          const source = resolveOverlayVideoDrawSource(
            vEl,
            this.videoHoldFrame.get(video.id),
            predecessorHold
          )
          if (!source) continue
          const progress = span > 0 ? Math.max(0, Math.min(1, elapsed / span)) : 0
          const kOvVid = resolveMediaKeyframeTransform(video, elapsed, span)
          ctx.save()
          ctx.globalAlpha = video.opacity
          runWithPlacementRotation(
            ctx,
            cr.x + kOvVid.x * xScale,
            cr.y + kOvVid.y * yScale,
            kOvVid.width * xScale,
            kOvVid.height * yScale,
            0,
            (px, py) => {
              applyZoomTransform(ctx, video.animation, video.transition, progress, source, px, py, kOvVid.width * xScale, kOvVid.height * yScale, kOvVid.cropSx, kOvVid.cropSy, kOvVid.cropSw, kOvVid.cropSh, kOvVid.zoomIntensity, span, video.animationDuration, currentTime - video.timestamp, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, video.transitionColor, video.transitionFlashMode, video.transitionDirection, video.transitionAxis, video.transitionSlideEasing, video.transitionCircleEasing, video.transitionWipeEasing, video.animationZoomEasing, undefined, video.zoomDistanceIntensity, undefined)
            },
            video.flipHorizontal,
            video.flipVertical
          )
          ctx.restore()
          if (!vEl.seeking && videoElementHasDecodedFrame(vEl)) {
            const cached = resolvePreviewVideoDrawSource(vEl)
            if (cached) {
              this.videoHoldFrame.set(video.id, cached)
            }
          }
        } else {
          drawTextOverlay(ctx, e.text, cr, currentTime)
        }
      }
    }
  }
}
