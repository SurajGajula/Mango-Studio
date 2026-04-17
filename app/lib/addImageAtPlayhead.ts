import { ImageClass } from '@/app/models/ImageClass'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { createSolidShapeDataUrl, type SolidShapeKind } from '@/app/lib/solidColorImage'
import { useManifestStore } from '@/app/stores/manifestStore'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'

function findFreeRow(
  items: Array<{ startTime: number; endTime: number; row: number }>,
  start: number,
  end: number
): number {
  let row = 0
  while (true) {
    const rowItems = items.filter((i) => i.row === row)
    const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
    if (!hasOverlap) return row
    row++
  }
}

export type AddImageAtPlayheadOptions = {
  importCropAspect?: string
}

export async function addImageAtTimelineTime(
  url: string,
  name: string,
  startTime: number,
  options?: AddImageAtPlayheadOptions
) {
  const { videos, images, addImage } = useManifestStore.getState()
  const aspectRatio = FIXED_ASPECT_RATIO
  const start = Math.max(0, startTime)
  const end = start + 5

  const mediaItems = [
    ...images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
    ...videos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
  ]
  let row = findFreeRow(mediaItems, start, end)
  if (row > 0) {
    row = findFreeVisualOverlayRow(start, end)
  }
  const isMainTrack = row === 0
  const cropLabel = options?.importCropAspect ?? aspectRatio
  const [rw, rh] = ASPECT_RATIOS[cropLabel] ?? ASPECT_RATIOS[aspectRatio]
  const crop = await computeMediaCropForAspect(url, 'image', aspectRatio, rw, rh, cropLabel)
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
      isMainTrack,
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
      row
    )
  )
}

export async function addImageAtCurrentPlayhead(
  url: string,
  name: string,
  options?: AddImageAtPlayheadOptions
) {
  const { playbackTime } = useManifestStore.getState()
  await addImageAtTimelineTime(url, name, playbackTime, options)
}

export async function addSolidShapePresetAtPlayhead(color: string, name: string, shape: SolidShapeKind) {
  await addImageAtCurrentPlayhead(createSolidShapeDataUrl(color, shape), name, {
    importCropAspect: '1:1',
  })
}
