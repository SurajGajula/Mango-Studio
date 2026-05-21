import { describe, expect, it } from 'vitest'
import { isSnapshotPayloadVisuallyEmpty } from '@/app/lib/projectPersistence'
import type { ProjectSnapshotPayload } from '@/app/lib/projectPersistence'

function emptySnapshot(): ProjectSnapshotPayload {
  return { version: 1, videos: [], images: [], texts: [], audios: [], effects: [] }
}

describe('isSnapshotPayloadVisuallyEmpty', () => {
  it('returns true when all tracks are empty', () => {
    expect(isSnapshotPayloadVisuallyEmpty(emptySnapshot())).toBe(true)
  })

  it('returns false when any track has items', () => {
    expect(
      isSnapshotPayloadVisuallyEmpty({
        ...emptySnapshot(),
        videos: [{ id: 'v1' }],
      })
    ).toBe(false)
  })
})
