import { describe, expect, it } from 'vitest'
import {
  isPersistedBlobTokenRef,
  isPlaybackFetchableUrl,
  needsPersistedMediaUrlRepair,
  PERSISTED_BLOB_TOKEN_PREFIX,
} from '@/app/lib/persistedMediaRefs'

describe('persistedMediaRefs', () => {
  it('detects persisted blob tokens', () => {
    expect(isPersistedBlobTokenRef(`${PERSISTED_BLOB_TOKEN_PREFIX}4`)).toBe(true)
    expect(isPersistedBlobTokenRef('/api/media/asset/abc')).toBe(false)
  })

  it('flags blob tokens and stale blob urls for repair', () => {
    expect(needsPersistedMediaUrlRepair(`${PERSISTED_BLOB_TOKEN_PREFIX}0`)).toBe(true)
    expect(needsPersistedMediaUrlRepair('blob:http://localhost/x')).toBe(true)
    expect(needsPersistedMediaUrlRepair('/api/media/asset/x')).toBe(false)
  })

  it('treats non-fetchable urls as not playback-ready', () => {
    expect(isPlaybackFetchableUrl(`${PERSISTED_BLOB_TOKEN_PREFIX}4`)).toBe(false)
    expect(isPlaybackFetchableUrl('/api/media/asset/x')).toBe(true)
  })
})
