import { describe, expect, it } from 'vitest'
import {
  isSnapshotPayloadVisuallyEmpty,
  pickPreferredSnapshotSource,
  snapshotUsesLocalOnlyMediaRefs,
} from '@/app/lib/projectPersistence'
import type { ProjectSnapshotPayload } from '@/app/lib/projectPersistence'
import { PERSISTED_BLOB_TOKEN_PREFIX } from '@/app/lib/persistedMediaRefs'

function emptySnapshot(): ProjectSnapshotPayload {
  return { version: 1, videos: [], images: [], texts: [], audios: [], effects: [] }
}

function filledSnapshot(id = 'v1'): ProjectSnapshotPayload {
  return { ...emptySnapshot(), videos: [{ id }] }
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

describe('pickPreferredSnapshotSource', () => {
  it('prefers newer cloud over older local draft', () => {
    expect(
      pickPreferredSnapshotSource(
        { snapshot: filledSnapshot('local'), savedAt: 1000 },
        { snapshot: filledSnapshot('cloud'), updatedAt: 2000 }
      )
    ).toBe('cloud')
  })

  it('prefers newer local over older cloud', () => {
    expect(
      pickPreferredSnapshotSource(
        { snapshot: filledSnapshot('local'), savedAt: 3000 },
        { snapshot: filledSnapshot('cloud'), updatedAt: 2000 }
      )
    ).toBe('local')
  })

  it('treats legacy local drafts without savedAt as older than cloud', () => {
    expect(
      pickPreferredSnapshotSource(
        { snapshot: filledSnapshot('local'), savedAt: 0 },
        { snapshot: filledSnapshot('cloud'), updatedAt: 1 }
      )
    ).toBe('cloud')
  })

  it('falls back to whichever source has content', () => {
    expect(
      pickPreferredSnapshotSource(null, { snapshot: filledSnapshot('cloud'), updatedAt: 1 })
    ).toBe('cloud')
    expect(
      pickPreferredSnapshotSource({ snapshot: filledSnapshot('local'), savedAt: 1 }, null)
    ).toBe('local')
    expect(pickPreferredSnapshotSource(null, null)).toBe(null)
  })
})
