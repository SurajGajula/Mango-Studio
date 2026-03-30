import type { ImageClass } from '@/app/models/ImageClass'
import type { VideoClass } from '@/app/models/VideoClass'

export type CropFields = {
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
}

export function getEffectiveCropForEdit(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null
): CropFields {
  if (!selectedKeyframeId) {
    return {
      cropSx: item.cropSx ?? 0,
      cropSy: item.cropSy ?? 0,
      cropSw: item.cropSw ?? 1,
      cropSh: item.cropSh ?? 1,
    }
  }
  const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
  if (!k) {
    return {
      cropSx: item.cropSx ?? 0,
      cropSy: item.cropSy ?? 0,
      cropSw: item.cropSw ?? 1,
      cropSh: item.cropSh ?? 1,
    }
  }
  return {
    cropSx: k.cropSx,
    cropSy: k.cropSy,
    cropSw: k.cropSw,
    cropSh: k.cropSh,
  }
}

type CropPatch = Partial<CropFields & { zoomIntensity: number }>

export function patchCropForItemOrKeyframe(
  item: ImageClass | VideoClass,
  selectedKeyframeId: string | null,
  patch: CropPatch
): Partial<ImageClass> | Partial<VideoClass> {
  if (!selectedKeyframeId) return patch
  const k = item.keyframes.find((x) => x.id === selectedKeyframeId)
  if (!k) return patch
  return {
    keyframes: item.keyframes.map((kf) =>
      kf.id === selectedKeyframeId ? { ...kf, ...patch } : kf
    ),
  }
}
