import { describe, it, expect, vi } from 'vitest'
import { syncSelectionToActivePlayingClip } from '@/app/lib/playbackSelectionSync'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import type { MainItem } from '@/app/lib/renderUtils'

function makeMainVideo(id: string, timestamp: number, duration: number) {
  return new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
}

function makeMainImage(id: string, startTime: number, endTime: number) {
  return new ImageClass(id, id, `https://example.com/${id}.png`, startTime, endTime)
}

function makeOverlayVideo(id: string, timestamp: number, duration: number, row: number) {
  const v = new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
  v.isOverlay = true
  v.row = row
  return v
}

describe('syncSelectionToActivePlayingClip', () => {
  it('follows active main-track video when a main-track video is selected', () => {
    const v1 = makeMainVideo('a', 0, 5)
    const v2 = makeMainVideo('b', 5, 5)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    const active: MainItem = {
      id: 'b',
      type: 'video',
      item: v2,
      startTime: 5,
      duration: 5,
    }
    syncSelectionToActivePlayingClip(6, active, [v1, v2], [], {
      selectedVideoId: 'a',
      selectedImageId: null,
      selectVideo,
      selectImage,
    })
    expect(selectVideo).toHaveBeenCalledWith('b')
    expect(selectImage).not.toHaveBeenCalled()
  })

  it('switches to main-track image when a main-track image was selected and active clip is image', () => {
    const img = makeMainImage('i', 0, 4)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    const active: MainItem = {
      id: 'i',
      type: 'image',
      item: img,
      startTime: 0,
      duration: 4,
    }
    syncSelectionToActivePlayingClip(1, active, [], [img], {
      selectedVideoId: null,
      selectedImageId: 'i',
      selectVideo,
      selectImage,
    })
    expect(selectImage).not.toHaveBeenCalled()
  })

  it('switches from main-track image selection to video when active main clip is video', () => {
    const img = makeMainImage('i', 0, 3)
    const v = makeMainVideo('v', 3, 5)
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    const active: MainItem = {
      id: 'v',
      type: 'video',
      item: v,
      startTime: 3,
      duration: 5,
    }
    syncSelectionToActivePlayingClip(4, active, [v], [img], {
      selectedVideoId: null,
      selectedImageId: 'i',
      selectVideo,
      selectImage,
    })
    expect(selectVideo).toHaveBeenCalledWith('v')
  })

  it('does not update when nothing is selected', () => {
    const selectVideo = vi.fn()
    const selectImage = vi.fn()
    syncSelectionToActivePlayingClip(0, null, [], [], {
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
    syncSelectionToActivePlayingClip(6, null, [a, b], [], {
      selectedVideoId: 'a',
      selectedImageId: null,
      selectVideo,
      selectImage,
    })
    expect(selectVideo).toHaveBeenCalledWith('b')
  })
})
