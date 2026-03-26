import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { useManifestStore } from '@/app/stores/manifestStore'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'

function makeVideo(id: string, timestamp: number, duration: number) {
  return new VideoClass(id, id, `https://example.com/${id}.mp4`, duration, timestamp)
}

function makeImage(id: string, startTime: number, endTime: number) {
  return new ImageClass(id, id, `https://example.com/${id}.png`, startTime, endTime)
}

beforeAll(() => {
  if (typeof globalThis.URL !== 'undefined' && typeof globalThis.URL.revokeObjectURL !== 'function') {
    globalThis.URL.revokeObjectURL = () => {}
  }
})

describe('manifestStore core invariants', () => {
  beforeEach(() => {
    useManifestStore.getState().resetStore()
  })

  it('adds a main-track video with expected id and timestamp', () => {
    const v = makeVideo('v-a', 0, 5)
    useManifestStore.getState().addVideo(v)
    const { videos } = useManifestStore.getState()
    expect(videos).toHaveLength(1)
    expect(videos[0].id).toBe('v-a')
    expect(videos[0].timestamp).toBe(0)
  })

  it('adds a main-track image with expected time range', () => {
    const img = makeImage('i-a', 0, 4)
    useManifestStore.getState().addImage(img)
    const { images } = useManifestStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].startTime).toBe(0)
    expect(images[0].endTime).toBe(4)
    expect(images[0].duration).toBe(4)
  })

  it('removes a video and shifts a following main-track clip by the removed duration', () => {
    const v1 = makeVideo('v-1', 0, 5)
    const v2 = makeVideo('v-2', 5, 4)
    const store = useManifestStore.getState()
    store.addVideo(v1)
    store.addVideo(v2)
    store.removeVideo('v-1')
    const { videos } = useManifestStore.getState()
    expect(videos.map((v) => v.id)).toEqual(['v-2'])
    expect(videos[0].timestamp).toBe(0)
  })

  it('removes an image and leaves images empty', () => {
    const img = makeImage('i-x', 0, 3)
    const store = useManifestStore.getState()
    store.addImage(img)
    store.removeImage('i-x')
    expect(useManifestStore.getState().images).toHaveLength(0)
  })

  it('replaceVideoSource updates url and title in place', () => {
    const v = makeVideo('v-r', 0, 2)
    const store = useManifestStore.getState()
    store.addVideo(v)
    store.replaceVideoSource('v-r', 'https://example.com/replaced.mp4', 'new-title')
    const { videos } = useManifestStore.getState()
    expect(videos).toHaveLength(1)
    expect(videos[0].id).toBe('v-r')
    expect(videos[0].url).toBe('https://example.com/replaced.mp4')
    expect(videos[0].title).toBe('new-title')
  })

  it('replaceImageSource updates url and name in place', () => {
    const img = makeImage('i-r', 0, 2)
    const store = useManifestStore.getState()
    store.addImage(img)
    store.replaceImageSource('i-r', 'https://example.com/replaced.png', 'new-name')
    const { images } = useManifestStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].id).toBe('i-r')
    expect(images[0].url).toBe('https://example.com/replaced.png')
    expect(images[0].name).toBe('new-name')
  })

  it('replaceVideoWithImage removes the video, inserts the image, and shifts following clips by duration delta', () => {
    const v1 = makeVideo('v-main', 0, 5)
    const v2 = makeVideo('v-follow', 5, 2)
    const replacement = makeImage('i-new', 0, 2)
    const store = useManifestStore.getState()
    store.addVideo(v1)
    store.addVideo(v2)
    store.replaceVideoWithImage('v-main', replacement)
    const { videos, images } = useManifestStore.getState()
    expect(videos.map((v) => v.id)).toEqual(['v-follow'])
    expect(videos[0].timestamp).toBe(2)
    expect(images.map((i) => i.id)).toContain('i-new')
  })

  it('replaceImageWithVideo removes the image, inserts the video, and shifts following clips by duration delta', () => {
    const img = makeImage('i-main', 0, 3)
    const vFollow = makeVideo('v-follow', 3, 2)
    const newClip = makeVideo('v-new', 0, 5)
    const store = useManifestStore.getState()
    store.addImage(img)
    store.addVideo(vFollow)
    store.replaceImageWithVideo('i-main', newClip)
    const { videos, images } = useManifestStore.getState()
    expect(images).toHaveLength(0)
    expect(videos.map((v) => v.id).sort()).toEqual(['v-follow', 'v-new'].sort())
    const follow = videos.find((v) => v.id === 'v-follow')
    expect(follow?.timestamp).toBe(5)
  })

  it('duplicateItem appends a new main-track video after the original span', () => {
    const v = makeVideo('v-dup', 0, 5)
    const store = useManifestStore.getState()
    store.addVideo(v)
    store.duplicateItem('v-dup')
    const { videos } = useManifestStore.getState()
    expect(videos).toHaveLength(2)
    const original = videos.find((x) => x.id === 'v-dup')
    const duplicate = videos.find((x) => x.id !== 'v-dup')
    expect(original).toBeDefined()
    expect(duplicate).toBeDefined()
    expect(duplicate!.timestamp).toBe(5)
  })

  it('undo and redo restore and reapply manifest lists after removeVideo', () => {
    const v = makeVideo('v-undo', 0, 3)
    const store = useManifestStore.getState()
    store.addVideo(v)
    store.removeVideo('v-undo')
    expect(useManifestStore.getState().videos).toHaveLength(0)
    store.undo()
    const afterUndo = useManifestStore.getState().videos
    expect(afterUndo).toHaveLength(1)
    expect(afterUndo[0].id).toBe('v-undo')
    store.redo()
    expect(useManifestStore.getState().videos).toHaveLength(0)
  })
})
