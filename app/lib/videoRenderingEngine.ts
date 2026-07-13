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
  isImageActiveAtTimelineTime,
  isVideoActiveAtTimelineTime,
  videoElapsedForMapping,
} from '@/app/lib/adjacentSplitVideo'
import { rowClipElapsedAtTime } from '@/app/lib/timelineClipAdjacency'
import {
  uniqueVideoMediaUrlCount,
  videoEffectiveSourceSpanSeconds,
  videoPlaybackTrimEnd,
  videoSourceSpanSeconds,
  videoSourceTrimBase,
} from '@/app/lib/videoPlaybackSource'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import { runWithPlacementRotation } from '@/app/lib/placementRotation'
import { applyZoomTransform } from '@/app/lib/applyZoomTransform'
import { applyActiveEffects } from '@/app/lib/applyEffect'
import { drawTextOverlay } from '@/app/lib/drawTextOverlay'
import {
  invalidatePreviewVideoFrameCache,
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
const VIDEO_FRAME_MATCH_TOLERANCE_SEC = 0.5
const HOLD_CAPTURE_TOLERANCE_SEC = 0.75
const CONTINUOUS_HANDOFF_SEEK_SEC = 0.12
const PREWARM_LEAD_SEC = 10
const PREWARM_LEAD_SEC_MANY_CLIPS = 3
const MANY_UNIQUE_SOURCES = 3
const PREVIEW_CHROME_FILL = '#0f0f0f'

const previewVideoPrimeAwaitSeeked = new WeakSet<HTMLVideoElement>()
const lastDrivenClipByElement = new WeakMap<HTMLVideoElement, string>()
const lastGoodFrameByElement = new WeakMap<HTMLVideoElement, HTMLCanvasElement>()

function prewarmLeadForTimeline(videos: VideoClass[]): number {
  const uniqueSources = uniqueVideoMediaUrlCount(videos)
  if (uniqueSources <= 2) return PREWARM_LEAD_SEC
  return uniqueSources > MANY_UNIQUE_SOURCES ? PREWARM_LEAD_SEC_MANY_CLIPS : PREWARM_LEAD_SEC
}

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

function videoElementMatchesExpectedTime(
  vEl: HTMLVideoElement,
  expectedTime: number | undefined,
  tolerance = VIDEO_FRAME_MATCH_TOLERANCE_SEC
): boolean {
  if (expectedTime === undefined) return true
  if (!Number.isFinite(vEl.currentTime)) return false
  return Math.abs(vEl.currentTime - expectedTime) <= tolerance
}

function resolveOverlayVideoDrawSource(
  vEl: HTMLVideoElement,
  sameVideoHold: HTMLCanvasElement | undefined,
  fallbackHold: HTMLCanvasElement | undefined,
  opts?: {
    allowLive?: boolean
    expectedTime?: number
    allowFallbackHold?: boolean
    bridgeHold?: HTMLCanvasElement
  }
): HTMLVideoElement | HTMLCanvasElement | null {
  const allowLive = opts?.allowLive !== false
  const timeOk = videoElementMatchesExpectedTime(vEl, opts?.expectedTime)
  if (allowLive && timeOk && !vEl.seeking && videoElementHasDecodedFrame(vEl)) {
    return vEl
  }
  if (sameVideoHold) return sameVideoHold
  if (opts?.allowFallbackHold !== false && fallbackHold) return fallbackHold
  if (opts?.bridgeHold) return opts.bridgeHold
  return null
}

function copyFrameToCanvas(
  source: HTMLCanvasElement,
  dest?: HTMLCanvasElement
): HTMLCanvasElement {
  const out = dest && dest !== source ? dest : document.createElement('canvas')
  if (out.width !== source.width || out.height !== source.height) {
    out.width = source.width
    out.height = source.height
  }
  const ctx = out.getContext('2d')
  if (ctx) ctx.drawImage(source, 0, 0)
  return out
}

function storeClipHoldFrame(
  holdMap: Map<string, HTMLCanvasElement>,
  clipId: string,
  source: HTMLCanvasElement
) {
  const existing = holdMap.get(clipId)
  holdMap.set(clipId, copyFrameToCanvas(source, existing && existing !== source ? existing : undefined))
}

function storeElementBridgeFrame(vEl: HTMLVideoElement, source: HTMLCanvasElement) {
  const existing = lastGoodFrameByElement.get(vEl)
  lastGoodFrameByElement.set(
    vEl,
    copyFrameToCanvas(source, existing && existing !== source ? existing : undefined)
  )
}

function captureLiveFrameToHolds(
  holdMap: Map<string, HTMLCanvasElement>,
  vEl: HTMLVideoElement,
  clipId: string | undefined
) {
  if (vEl.seeking || !videoElementHasDecodedFrame(vEl)) return
  const cached = resolvePreviewVideoDrawSource(vEl)
  if (!cached) return
  storeElementBridgeFrame(vEl, cached)
  if (clipId) storeClipHoldFrame(holdMap, clipId, cached)
}

function expectedSourceTimeForClip(
  video: VideoClass,
  timelineTime: number,
  vEl: HTMLVideoElement
): number {
  const span = manifestVideoTimelineSpanSeconds(video)
  const elapsed = videoElapsedForMapping(video, timelineTime)
  const vDur = clipTimelineSpanForSourceMap(span)
  const tmV = videoTimelineSourceMapping(video, elapsed, vDur)
  const sourceSpan = videoEffectiveSourceSpanSeconds(video, vEl)
  const cappedSourceElapsed = Math.min(tmV.sourceElapsed, sourceSpan)
  return clampVideoSourceSeekTime(
    video,
    vEl,
    videoSourceTrimBase(video) + cappedSourceElapsed
  )
}

function adjacentSameSourceIsContinuous(pred: VideoClass, next: VideoClass): boolean {
  const predEnd = videoSourceTrimBase(pred) + videoSourceSpanSeconds(pred)
  const nextStart = videoSourceTrimBase(next)
  return Math.abs(predEnd - nextStart) < 0.08
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
  private effectsLayer: HTMLCanvasElement | null = null

  private getEffectsLayer(width: number, height: number): HTMLCanvasElement {
    if (!this.effectsLayer) {
      this.effectsLayer = document.createElement('canvas')
    }
    if (this.effectsLayer.width !== width || this.effectsLayer.height !== height) {
      this.effectsLayer.width = width
      this.effectsLayer.height = height
    }
    return this.effectsLayer
  }

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
      const pr = findActiveAndNextItems(sortedR, newTime, state.videos)
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
        const active =
          image.row >= 0 && isImageActiveAtTimelineTime(image, state.videos, state.images, newTime)
        if (!active) return `${image.id}:out`
        const bitmap = imageBitmaps.get(image.id)
        if (!bitmap) return `${image.id}:missing`
        return `${image.id}:ready:${bitmap.width}x${bitmap.height}`
      })
      .join('~')
    const stateKey = `${cr.width}-${cr.height}-${videoVisualKey}-${imageVisualKey}-${textVisualKey}-${effectsKey}-${imageRuntimeKey}`
    const prewarmLead = prewarmLeadForTimeline(state.videos)

    type DriveCandidate = {
      video: (typeof state.videos)[number]
      vEl: HTMLVideoElement
      inRange: boolean
      prewarm: boolean
      span: number
    }
    const driveCandidates: DriveCandidate[] = []

    for (let i = 0; i < state.videos.length; i++) {
      const video = state.videos[i]
      const vEl = videoElements.get(video.id)
      if (!vEl) continue

      const span = manifestVideoTimelineSpanSeconds(video)
      const inRange = span > 0 && isVideoActiveAtTimelineTime(video, state.videos, newTime, state.images)

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

      if (!inRange && !prewarm) continue
      driveCandidates.push({ video, vEl, inRange, prewarm, span })
    }

    driveCandidates.sort((a, b) => {
      if (a.inRange !== b.inRange) return a.inRange ? -1 : 1
      return b.video.timestamp - a.video.timestamp
    })

    const bestCandidateByElement = new Map<HTMLVideoElement, DriveCandidate>()
    for (let i = 0; i < driveCandidates.length; i++) {
      const candidate = driveCandidates[i]
      const existing = bestCandidateByElement.get(candidate.vEl)
      if (!existing) {
        bestCandidateByElement.set(candidate.vEl, candidate)
        continue
      }
      if (candidate.inRange && !existing.inRange) {
        bestCandidateByElement.set(candidate.vEl, candidate)
        continue
      }
      if (candidate.inRange === existing.inRange && candidate.video.timestamp > existing.video.timestamp) {
        bestCandidateByElement.set(candidate.vEl, candidate)
      }
    }

    const drivenElements = new WeakSet<HTMLVideoElement>()
    for (const { video, vEl, inRange, prewarm, span } of bestCandidateByElement.values()) {
      drivenElements.add(vEl)

      const elapsed = videoElapsedForMapping(video, newTime)
      const vDur = clipTimelineSpanForSourceMap(span)
      const tmV = videoTimelineSourceMapping(video, elapsed, vDur)
      const sourceSpan = videoEffectiveSourceSpanSeconds(video, vEl)
      const cappedSourceElapsed = Math.min(tmV.sourceElapsed, sourceSpan)
      const target = videoSourceTrimBase(video) + cappedSourceElapsed
      const clampedTarget = clampVideoSourceSeekTime(video, vEl, target)
      const onVideoUpdate = (t: number) => onVideoTimeUpdate(video.id, t)
      const decodeOnlyPrewarm = prewarm && !inRange
      const morphSync = isActiveMorphVideo(video.id, rowTransitionByRow.get(video.row))
      const previousClipId = lastDrivenClipByElement.get(vEl)
      const clipHandoff = !!previousClipId && previousClipId !== video.id
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

      if (clipHandoff && previousClipId) {
        captureLiveFrameToHolds(this.videoHoldFrame, vEl, previousClipId)
        const previousClip = state.videos.find((entry) => entry.id === previousClipId)
        const continuous =
          !!previousClip && adjacentSameSourceIsContinuous(previousClip, video)
        const handoffDrift = Math.abs(vEl.currentTime - clampedTarget)

        if (continuous && handoffDrift <= CONTINUOUS_HANDOFF_SEEK_SEC) {
          if (!vEl.seeking && handoffDrift > 0.05) {
            vEl.currentTime = clampedTarget
            onVideoUpdate(clampedTarget)
          }
        } else {
          invalidatePreviewVideoFrameCache(vEl)
          if (!vEl.seeking && handoffDrift > 0.01) {
            vEl.currentTime = clampedTarget
            onVideoUpdate(clampedTarget)
          }
        }
      }
      lastDrivenClipByElement.set(vEl, video.id)

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

    const pausedElements = new WeakSet<HTMLVideoElement>()
    videoElements.forEach((vEl, id) => {
      if (drivenElements.has(vEl) || pausedElements.has(vEl)) return
      pausedElements.add(vEl)
      if (!vEl.paused) onVideoPlayState(id, false, 1)
    })

    bufferCtx.fillStyle = PREVIEW_CHROME_FILL
    bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height)
    bufferCtx.fillStyle = '#000000'
    bufferCtx.fillRect(cr.x, cr.y, cr.width, cr.height)

    const activeEffects =
      effects && effects.length > 0
        ? effects
            .filter((eff) => newTime >= eff.startTime && newTime < eff.endTime)
            .sort((a, b) => a.row - b.row || a.startTime - b.startTime)
        : []

    if (activeEffects.length > 0) {
      const layer = this.getEffectsLayer(bufferCanvas.width, bufferCanvas.height)
      const layerCtx = layer.getContext('2d', { willReadFrequently: true })
      if (layerCtx) {
        layerCtx.setTransform(1, 0, 0, 1, 0, 0)
        layerCtx.clearRect(0, 0, layer.width, layer.height)
        this.drawOverlays(
          layerCtx,
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
        applyActiveEffects(
          layerCtx,
          activeEffects,
          cr.x,
          cr.y,
          cr.width,
          cr.height,
          newTime
        )
        bufferCtx.drawImage(layer, 0, 0)
      } else {
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
      }
    } else {
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
      if (image.row < 0 || !isImageActiveAtTimelineTime(image, videos, images, currentTime)) continue
      entries.push({ kind: 'image', row: image.row, t0: image.startTime, image })
    }
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      if (video.row < 0) continue
      const span = manifestVideoTimelineSpanSeconds(video)
      if (span <= 0 || !isVideoActiveAtTimelineTime(video, videos, currentTime, images)) continue
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
            if (!video) {
              return resolveOverlayVideoDrawSource(el, this.videoHoldFrame.get(id), undefined, {
                bridgeHold: lastGoodFrameByElement.get(el),
              })
            }
            const expectedTime = expectedSourceTimeForClip(video, currentTime, el)
            const isDriver = lastDrivenClipByElement.get(el) === id
            const predecessor = findAdjacentSameSourcePredecessor(videos, video)
            const predecessorHold = predecessor ? this.videoHoldFrame.get(predecessor.id) : undefined
            const allowFallbackHold =
              !!predecessor && isDriver && adjacentSameSourceIsContinuous(predecessor, video)
            return resolveOverlayVideoDrawSource(el, this.videoHoldFrame.get(id), predecessorHold, {
              allowLive: isDriver,
              expectedTime,
              allowFallbackHold,
              bridgeHold: isDriver ? lastGoodFrameByElement.get(el) : undefined,
            })
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
          const imageElapsed = rowClipElapsedAtTime(
            { id: image.id, type: 'image', startTime: image.startTime, duration: image.duration, item: image },
            currentTime
          )
          const progress = calculateAnimationProgress(image, currentTime, image.startTime)
          const kOvImg = resolveMediaKeyframeTransform(image, imageElapsed, image.duration)
          const ox = cr.x + kOvImg.x * xScale
          const oy = cr.y + kOvImg.y * yScale
          const ow = kOvImg.width * xScale
          const oh = kOvImg.height * yScale
          ctx.save()
          ctx.globalAlpha = image.opacity
          runWithPlacementRotation(ctx, ox, oy, ow, oh, image.rotation, (px, py) => {
            applyZoomTransform(ctx, image.animation, image.transition, progress, bitmap, px, py, ow, oh, kOvImg.cropSx, kOvImg.cropSy, kOvImg.cropSw, kOvImg.cropSh, kOvImg.zoomIntensity, image.duration, image.animationDuration, imageElapsed, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, image.transitionColor, image.transitionFlashMode, image.transitionDirection, image.transitionAxis, image.transitionSlideEasing, image.transitionCircleEasing, image.transitionWipeEasing, image.animationZoomEasing, undefined, image.zoomDistanceIntensity, undefined)
          }, image.flipHorizontal, image.flipVertical)
          ctx.restore()
        } else if (e.kind === 'video') {
          const video = e.video
          const span = manifestVideoTimelineSpanSeconds(video)
          const elapsed = videoElapsedForMapping(video, currentTime)
          const vEl = videoElements.get(video.id)
          if (!vEl) continue
          const expectedTime = expectedSourceTimeForClip(video, currentTime, vEl)
          const isDriver = lastDrivenClipByElement.get(vEl) === video.id
          const predecessor = findAdjacentSameSourcePredecessor(videos, video)
          const predecessorHold = predecessor ? this.videoHoldFrame.get(predecessor.id) : undefined
          const source = resolveOverlayVideoDrawSource(
            vEl,
            this.videoHoldFrame.get(video.id),
            predecessorHold,
            {
              allowLive: isDriver,
              expectedTime,
              allowFallbackHold:
                !!predecessor && isDriver && adjacentSameSourceIsContinuous(predecessor, video),
              bridgeHold: isDriver ? lastGoodFrameByElement.get(vEl) : undefined,
            }
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
          if (
            isDriver &&
            !vEl.seeking &&
            videoElementMatchesExpectedTime(vEl, expectedTime, HOLD_CAPTURE_TOLERANCE_SEC) &&
            videoElementHasDecodedFrame(vEl)
          ) {
            captureLiveFrameToHolds(this.videoHoldFrame, vEl, video.id)
          }
        } else {
          drawTextOverlay(ctx, e.text, cr, currentTime)
        }
      }
    }
  }
}
