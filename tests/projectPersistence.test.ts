import { describe, expect, it } from 'vitest'
import {
  isSnapshotPayloadVisuallyEmpty,
  snapshotUsesLocalOnlyMediaRefs,
} from '@/app/lib/projectPersistence'
import type { ProjectSnapshotPayload } from '@/app/lib/projectPersistence'
import { PERSISTED_BLOB_TOKEN_PREFIX } from '@/app/lib/persistedMediaRefs'

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

describe('snapshotUsesLocalOnlyMediaRefs', () => {
  it('allows data URLs used by solids and frame captures', () => {
    expect(
      snapshotUsesLocalOnlyMediaRefs({
        ...emptySnapshot(),
        images: [{ id: 'i1', url: 'data:image/png;base64,abc' }],
      })
    ).toBe(false)
  })

  it('blocks blob URLs and persisted blob tokens', () => {
    expect(
      snapshotUsesLocalOnlyMediaRefs({
        ...emptySnapshot(),
        videos: [{ id: 'v1', url: 'blob:https://example/1' }],
      })
    ).toBe(true)
    expect(
      snapshotUsesLocalOnlyMediaRefs({
        ...emptySnapshot(),
        images: [{ id: 'i1', url: `${PERSISTED_BLOB_TOKEN_PREFIX}0` }],
      })
    ).toBe(true)
  })
})
