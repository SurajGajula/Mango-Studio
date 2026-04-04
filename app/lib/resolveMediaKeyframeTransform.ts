import type { MediaKeyframe } from '@/app/models/mediaKeyframe'
import type { ImageClass } from '@/app/models/ImageClass'
import type { VideoClass } from '@/app/models/VideoClass'

export type KeyframeCropZoom = {
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  zoomIntensity: number
}

type ClipWithKeyframes = Pick<
  VideoClass | ImageClass,
  'cropSx' | 'cropSy' | 'cropSw' | 'cropSh' | 'zoomIntensity' | 'keyframes'
>

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function keyframeToCrop(k: MediaKeyframe): KeyframeCropZoom {
  return {
    cropSx: k.cropSx,
    cropSy: k.cropSy,
    cropSw: k.cropSw,
    cropSh: k.cropSh,
    zoomIntensity: k.zoomIntensity,
  }
}

export function resolveMediaKeyframeTransform(
  item: ClipWithKeyframes,
  localTime: number,
  clipDuration: number
): KeyframeCropZoom {
  const base: KeyframeCropZoom = {
    cropSx: item.cropSx ?? 0,
    cropSy: item.cropSy ?? 0,
    cropSw: item.cropSw ?? 1,
    cropSh: item.cropSh ?? 1,
    zoomIntensity: item.zoomIntensity ?? 0.5,
  }

  const kfs = [...(item.keyframes ?? [])].sort((a, b) => a.t - b.t)
  if (kfs.length === 0) return base

  const maxT = Math.max(0, clipDuration)
  const u = Math.max(0, Math.min(maxT, localTime))

  if (kfs.length === 1) return keyframeToCrop(kfs[0])

  if (u <= kfs[0].t) return keyframeToCrop(kfs[0])
  const last = kfs[kfs.length - 1]
  if (u >= last.t) return keyframeToCrop(last)

  let lo = 0
  for (let i = 0; i < kfs.length - 1; i++) {
    if (u >= kfs[i].t && u <= kfs[i + 1].t) {
      lo = i
      break
    }
  }

  const a = kfs[lo]
  const b = kfs[lo + 1]
  const span = b.t - a.t
  const w = span > 0 ? (u - a.t) / span : 0
  return {
    cropSx: lerp(a.cropSx, b.cropSx, w),
    cropSy: lerp(a.cropSy, b.cropSy, w),
    cropSw: lerp(a.cropSw, b.cropSw, w),
    cropSh: lerp(a.cropSh, b.cropSh, w),
    zoomIntensity: lerp(a.zoomIntensity, b.zoomIntensity, w),
  }
}
