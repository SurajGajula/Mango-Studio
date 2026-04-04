import { describe, it, expect } from 'vitest'
import { VideoClass } from '@/app/models/VideoClass'
import {
  videoThumbnailCacheKey,
  videoThumbnailTimeBase,
  videoThumbnailSecondIndices,
} from '@/app/lib/videoThumbnailKey'

describe('videoThumbnailKey', () => {
  it('uses url when no separate source', () => {
    const v = new VideoClass('v1', 't', 'blob:full', 10, 0)
    expect(videoThumbnailCacheKey(v)).toBe('blob:full')
    expect(videoThumbnailTimeBase(v)).toBe(0)
    expect(videoThumbnailSecondIndices(v).length).toBe(10)
  })

  it('uses sourceUrl and sourceTrimStart for extracted segment clips', () => {
    const v = new VideoClass('v1', 't', 'blob:seg', 5, 0, undefined, undefined, 10, 0, 0)
    v.sourceUrl = 'blob:full'
    v.sourceTrimStart = 120
    v.sourceDuration = 600
    expect(videoThumbnailCacheKey(v)).toBe('blob:full')
    expect(videoThumbnailTimeBase(v)).toBe(120)
    expect(videoThumbnailSecondIndices(v)).toEqual([120, 121, 122, 123, 124])
  })

  it('uses trimStart for in-out on full url', () => {
    const v = new VideoClass('v1', 't', 'blob:full', 4, 0, undefined, undefined, 10, 3, 0)
    expect(videoThumbnailCacheKey(v)).toBe('blob:full')
    expect(videoThumbnailSecondIndices(v)).toEqual([3, 4, 5, 6])
  })
})
