import type { VideoClass } from '@/app/models/VideoClass'
import type { ImageClass } from '@/app/models/ImageClass'
import type { MainItem } from '@/app/lib/renderUtils'

type SelectionSlice = {
  selectedVideoId: string | null
  selectedImageId: string | null
  selectVideo: (id: string | null) => void
  selectImage: (id: string | null) => void
}

export function syncSelectionToActivePlayingClip(
  playbackTime: number,
  activeMainClip: MainItem | null,
  videos: VideoClass[],
  images: ImageClass[],
  sel: SelectionSlice
) {
  const { selectedVideoId, selectedImageId } = sel
  if (!selectedVideoId && !selectedImageId) return

  const selectedMainVideo =
    !!selectedVideoId && videos.some((v) => v.id === selectedVideoId && !v.isOverlay)
  const selectedMainImage =
    !!selectedImageId && images.some((i) => i.id === selectedImageId && i.isMainTrack)
  if (selectedMainVideo || selectedMainImage) {
    if (!activeMainClip) return
    if (activeMainClip.type === 'video') {
      if (selectedVideoId !== activeMainClip.id) sel.selectVideo(activeMainClip.id)
    } else if (selectedImageId !== activeMainClip.id) {
      sel.selectImage(activeMainClip.id)
    }
    return
  }

  if (selectedVideoId) {
    const vSel = videos.find((v) => v.id === selectedVideoId)
    if (!vSel?.isOverlay) return
    const row = vSel.row
    const activeOnRow = videos
      .filter(
        (v) =>
          v.isOverlay &&
          v.row === row &&
          (v.duration ?? 0) > 0 &&
          playbackTime >= v.timestamp &&
          playbackTime < v.timestamp + (v.duration ?? 0)
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0]
    if (activeOnRow && activeOnRow.id !== selectedVideoId) sel.selectVideo(activeOnRow.id)
    return
  }

  const iSel = images.find((i) => i.id === selectedImageId)
  if (!iSel || iSel.isMainTrack) return
  const row = iSel.row
  const activeOnRow = images
    .filter(
      (i) =>
        !i.isMainTrack &&
        i.row === row &&
        playbackTime >= i.startTime &&
        playbackTime < i.endTime
    )
    .sort((a, b) => b.startTime - a.startTime)[0]
  if (activeOnRow && activeOnRow.id !== selectedImageId) sel.selectImage(activeOnRow.id)
}
