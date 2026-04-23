import { describe, it, expect, vi } from 'vitest'
import { syncSelectionToActivePlayingClip } from '@/app/lib/playbackSelectionSync'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'

function makeMainVideo(id: string, timestamp: number, duration: number) {
  return new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
}

function makeMainImage(id: string, startTime: number, endTime: number) {
  return new ImageClass(id, id, `https://example.com/${id}.png`, startTime, endTime)
}

function makeOverlayVideo(id: string, timestamp: number, duration: number, row: number) {
  const v = new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
  v.row = row
  return v
}

describe('syncSelectionToActivePlayingClip', () => {
  it('follows active video on selected row', () => {
    const v1 = makeMainVideo('a', 0, 5)
    const v2 = makeMainVideo('b', 5, 5)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(6, [v1, v2], [], {
      selectedVideoId: 'a',
      selectedImageId: null,
      selectVideo,
      selectImage,
    })
    expect(selectVideo).toHaveBeenCalledWith('b')
    expect(selectImage).not.toHaveBeenCalled()
  })

  it('does not change when same image stays active on row', () => {
    const img = makeMainImage('i', 0, 4)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(1, [], [img], {
      selectedVideoId: null,
      selectedImageId: 'i',
      selectVideo,
      selectImage,
    })
    expect(selectImage).not.toHaveBeenCalled()
  })

  it('does not switch type when selected item type differs from row active item', () => {
    const img = makeMainImage('i', 0, 3)
    const v = makeMainVideo('v', 3, 5)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(4, [v], [img], {
      selectedVideoId: null,
      selectedImageId: 'i',
      selectVideo,
      selectImage,
    })
    expect(selectVideo).not.toHaveBeenCalled()
  })

  it('does not update when nothing is selected', () => {
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(0, [], [], {
      selectedVideoId: null,
      selectedImageId: null,
      selectVideo,
      selectImage,
    })
    expect(selectVideo).not.toHaveBeenCalled()
    expect(selectImage).not.toHaveBeenCalled()
  })

  it('follows active overlay video on the same row', () => {
    const a = makeOverlayVideo('a', 0, 5, 2)
    const b = makeOverlayVideo('b', 5, 5, 2)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(6, [a, b], [], {
      selectedVideoId: 'a',
      selectedImageId: null,
      selectVideo,
      selectImage,
    })
    expect(selectVideo).toHaveBeenCalledWith('b')
  })
})
