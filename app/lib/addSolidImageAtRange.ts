import { ImageClass } from '@/app/models/ImageClass'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { createSolidColorDataUrl } from '@/app/lib/solidColorImage'
import { useManifestStore } from '@/app/stores/manifestStore'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { solidColorLabel } from '@/app/lib/webLlm/localSolidColorUtils'

export async function addSolidColorImageAtRange(color: string, startTime: number, endTime: number) {
  const { addImage } = useManifestStore.getState()
  const aspectRatio = FIXED_ASPECT_RATIO
  const start = Math.max(0, startTime)
  const end = Math.max(start, endTime)
  const row = findFreeVisualOverlayRow(start, end)
  const url = createSolidColorDataUrl(color)
  const name = `Solid ${solidColorLabel(color)}`
  const [rw, rh] = ASPECT_RATIOS['1:1'] ?? ASPECT_RATIOS[aspectRatio]
  const crop = await computeMediaCropForAspect(url, 'image', aspectRatio, rw, rh, '1:1')
  addImage(
    new ImageClass(
      `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      url,
      start,
      end,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      1,
      new Date(),
      'none',
      'none',
      crop.cropAspect,
      crop.cropSx,
      crop.cropSy,
      crop.cropSw,
      crop.cropSh,
      0.5,
      1.0,
      1.0,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      row,
      undefined,
      undefined,
      undefined,
      undefined
    )
  )
}
