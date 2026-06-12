import type { VideoClass } from '@/app/models/VideoClass'
import type { ImageClass } from '@/app/models/ImageClass'
import { findActiveAndNextItems, getSortedRowItems } from '@/app/lib/renderUtils'

type SelectionSlice = {
  selectedVideoId: string | null
  selectedImageId: string | null
  selectVideo: (id: string | null) => void
  selectImage: (id: string | null) => void
}

export function syncSelectionToActivePlayingClip(
  playbackTime: number,
  videos: VideoClass[],
  images: ImageClass[],
  sel: SelectionSlice
) {
  const { selectedVideoId, selectedImageId } = sel
  if (!selectedVideoId && !selectedImageId) return

  if (selectedVideoId) {
    const vSel = videos.find((v) => v.id === selectedVideoId)
    if (!vSel) return
    const rowItems = getSortedRowItems(vSel.row, videos, images)
    const { activeItem } = findActiveAndNextItems(rowItems, playbackTime, videos)
    if (activeItem?.type === 'video' && activeItem.id !== selectedVideoId) {
      sel.selectVideo(activeItem.id)
    }
    return
  }

  const iSel = images.find((i) => i.id === selectedImageId)
  if (!iSel) return
  const rowItems = getSortedRowItems(iSel.row, videos, images)
  const { activeItem } = findActiveAndNextItems(rowItems, playbackTime, videos)
  if (activeItem?.type === 'image' && activeItem.id !== selectedImageId) {
    sel.selectImage(activeItem.id)
  }
}
