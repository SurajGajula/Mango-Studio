import { ImageClass } from '@/app/models/ImageClass'
import { ASPECT_RATIOS, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { createSolidColorDataUrl } from '@/app/lib/solidColorImage'
import { useManifestStore } from '@/app/stores/manifestStore'

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

export async function addImageAtCurrentPlayhead(url: string, name: string) {
  const { playbackTime, aspectRatio, videos, images, addImage } = useManifestStore.getState()
  const start = playbackTime
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
  const [rw, rh] = ASPECT_RATIOS[aspectRatio]
  const crop = await computeMediaCropForAspect(url, 'image', aspectRatio, rw, rh, aspectRatio)
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
      row
    )
  )
}

export async function addSolidColorPresetAtPlayhead(color: string, name: string) {
  await addImageAtCurrentPlayhead(createSolidColorDataUrl(color), name)
}
