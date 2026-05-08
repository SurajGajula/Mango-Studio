import { generateId } from '@/app/lib/idUtils'
import { resolveMediaKeyframeTransform } from '@/app/lib/resolveMediaKeyframeTransform'
import type { ImageClass } from '@/app/models/ImageClass'
import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import type { VideoClass } from '@/app/models/VideoClass'

export type CropFields = {
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
}

export type PlacementFields = {
  x: number
  y: number
  width: number
  height: number
}

const KF_TIME_EPSILON = 0.05

function localElapsedForKeyframes(item: ImageClass | VideoClass, playbackTime: number): number {
  if ('startTime' in item) {
    const img = item as ImageClass
    const d = img.duration
    return Math.max(0, Math.min(d, playbackTime - img.startTime))
  }
  const v = item as VideoClass
  const d = v.duration ?? 0
  return Math.max(0, Math.min(d, playbackTime - v.timestamp))
}

function clipDurationForKeyframes(item: ImageClass | VideoClass): number {
  if ('startTime' in item) return (item as ImageClass).duration
  return (item as VideoClass).duration ?? 0
}

function baseCropFields(item: ImageClass | VideoClass): CropFields {
  return {
    cropSx: item.cropSx ?? 0,
    cropSy: item.cropSy ?? 0,
    cropSw: item.cropSw ?? 1,
    cropSh: item.cropSh ?? 1,
  }
}

function basePlacementFields(item: ImageClass | VideoClass): PlacementFields {
  return {
    x: item.x ?? 0,
    y: item.y ?? 0,
    width: item.width ?? 0,
    height: item.height ?? 0,
  }
}

export function getEffectiveCropForEdit(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null,
  playbackTime?: number
): CropFields {
  if (selectedKeyframeId) {
    const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
    if (k) {
      return {
        cropSx: k.cropSx,
        cropSy: k.cropSy,
        cropSw: k.cropSw,
        cropSh: k.cropSh,
      }
    }
    return baseCropFields(item)
  }
  const kfs = item.keyframes ?? []
  if (kfs.length > 0 && playbackTime !== undefined) {
    const localT = localElapsedForKeyframes(item, playbackTime)
    const dur = clipDurationForKeyframes(item)
    const r = resolveMediaKeyframeTransform(item, localT, dur)
    return {
      cropSx: r.cropSx,
      cropSy: r.cropSy,
      cropSw: r.cropSw,
      cropSh: r.cropSh,
    }
  }
  return baseCropFields(item)
}

export function getEffectivePlacementForEdit(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null,
  playbackTime?: number
): PlacementFields {
  if (selectedKeyframeId) {
    const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
    if (k) {
      return {
        x: k.x ?? item.x ?? 0,
        y: k.y ?? item.y ?? 0,
        width: k.width ?? item.width ?? 0,
        height: k.height ?? item.height ?? 0,
      }
    }
    return basePlacementFields(item)
  }
  const kfs = item.keyframes ?? []
  if (kfs.length > 0 && playbackTime !== undefined) {
    const localT = localElapsedForKeyframes(item, playbackTime)
    const dur = clipDurationForKeyframes(item)
    const r = resolveMediaKeyframeTransform(item, localT, dur)
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    }
  }
  return basePlacementFields(item)
}

type CropPatch = Partial<CropFields & { zoomIntensity: number }>
type PlacementPatch = Partial<PlacementFields>

function mergeKeyframeCrop(
  prev: {
    cropSx: number
    cropSy: number
    cropSw: number
    cropSh: number
    zoomIntensity: number
    x: number
    y: number
    width: number
    height: number
  },
  patch: CropPatch
) {
  return {
    cropSx: patch.cropSx ?? prev.cropSx,
    cropSy: patch.cropSy ?? prev.cropSy,
    cropSw: patch.cropSw ?? prev.cropSw,
    cropSh: patch.cropSh ?? prev.cropSh,
    zoomIntensity: patch.zoomIntensity ?? prev.zoomIntensity,
    x: prev.x,
    y: prev.y,
    width: prev.width,
    height: prev.height,
  }
}

export function patchCropForItemOrKeyframe(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null,
  patch: CropPatch,
  playbackTime?: number
): Partial<ImageClass> | Partial<VideoClass> {
  if (selectedKeyframeId) {
    const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
    if (!k) return patch
    return {
      keyframes: item.keyframes.map((kf) =>
        kf.id === selectedKeyframeId ? { ...kf, ...patch } : kf
      ),
    }
  }
  const kfs = item.keyframes ?? []
  if (kfs.length > 0 && playbackTime !== undefined) {
    const localT = localElapsedForKeyframes(item, playbackTime)
    const dur = clipDurationForKeyframes(item)
    const idx = kfs.findIndex((kf) => Math.abs(kf.t - localT) < KF_TIME_EPSILON)
    const prevCrop =
      idx >= 0
        ? {
            cropSx: kfs[idx].cropSx,
            cropSy: kfs[idx].cropSy,
            cropSw: kfs[idx].cropSw,
            cropSh: kfs[idx].cropSh,
            zoomIntensity: kfs[idx].zoomIntensity,
            x: kfs[idx].x ?? item.x ?? 0,
            y: kfs[idx].y ?? item.y ?? 0,
            width: kfs[idx].width ?? item.width ?? 0,
            height: kfs[idx].height ?? item.height ?? 0,
          }
        : resolveMediaKeyframeTransform(item, localT, dur)
    const merged = mergeKeyframeCrop(prevCrop, patch)
    const next: MediaKeyframe =
      idx >= 0
        ? { ...kfs[idx], ...merged }
        : { id: generateId('kf'), t: localT, ...merged }
    if (idx >= 0) {
      return {
        keyframes: kfs.map((kf, i) => (i === idx ? next : kf)),
      }
    }
    return {
      keyframes: [...kfs, next].sort((a, b) => a.t - b.t),
    }
  }
  return patch
}

export function patchPlacementForItemOrKeyframe(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null,
  patch: PlacementPatch,
  playbackTime?: number
): Partial<ImageClass> | Partial<VideoClass> {
  if (selectedKeyframeId) {
    const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
    if (!k) return patch
    return {
      keyframes: item.keyframes.map((kf) =>
        kf.id === selectedKeyframeId ? { ...kf, ...patch } : kf
      ),
    }
  }
  const kfs = item.keyframes ?? []
  if (kfs.length > 0 && playbackTime !== undefined) {
    const localT = localElapsedForKeyframes(item, playbackTime)
    const dur = clipDurationForKeyframes(item)
    const idx = kfs.findIndex((kf) => Math.abs(kf.t - localT) < KF_TIME_EPSILON)
    const prev =
      idx >= 0
        ? kfs[idx]
        : resolveMediaKeyframeTransform(item, localT, dur)
    const next: MediaKeyframe =
      idx >= 0
        ? { ...kfs[idx], ...patch }
        : {
            id: generateId('kf'),
            t: localT,
            cropSx: prev.cropSx,
            cropSy: prev.cropSy,
            cropSw: prev.cropSw,
            cropSh: prev.cropSh,
            zoomIntensity: prev.zoomIntensity,
            x: patch.x ?? prev.x,
            y: patch.y ?? prev.y,
            width: patch.width ?? prev.width,
            height: patch.height ?? prev.height,
          }
    if (idx >= 0) {
      return {
        keyframes: kfs.map((kf, i) => (i === idx ? next : kf)),
      }
    }
    return {
      keyframes: [...kfs, next].sort((a, b) => a.t - b.t),
    }
  }
  return patch
}
