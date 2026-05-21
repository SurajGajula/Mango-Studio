import { describe, expect, it } from 'vitest'
import {
  assetIdFromPlaybackUrl,
  findAccountAssetForTimelineItem,
  normalizeMediaLabel,
} from '@/app/lib/accountMediaLibraryMatch'
import type { AccountMediaAsset } from '@/app/lib/accountMediaTypes'

function asset(overrides: Partial<AccountMediaAsset> & Pick<AccountMediaAsset, 'id' | 'name' | 'kind'>): AccountMediaAsset {
  return {
    user_id: 'u',
    folder_id: null,
    original_filename: overrides.name,
    mime_type: 'video/mp4',
    size_bytes: 1,
    duration_seconds: 120,
    object_key: 'k',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('accountMediaLibraryMatch', () => {
  it('normalizes labels without extension', () => {
    expect(normalizeMediaLabel('Clip.MP4')).toBe('clip')
  })

  it('extracts asset id from account playback urls', () => {
    expect(assetIdFromPlaybackUrl('/api/media/asset/abc-123')).toBe('abc-123')
    expect(assetIdFromPlaybackUrl('blob:http://localhost/x')).toBeNull()
  })

  it('finds assets by playback url asset id', () => {
    const assets = [
      asset({ id: 'asset-uuid', name: 'other.wav', kind: 'audio', original_filename: 'other.wav' }),
    ]
    expect(findAccountAssetForTimelineItem(assets, 'wrong', 'audio', '/api/media/asset/asset-uuid')?.id).toBe(
      'asset-uuid'
    )
  })

  it('finds assets by display name or original filename', () => {
    const assets = [
      asset({ id: '1', name: 'voiceover.wav', kind: 'audio', original_filename: 'voiceover.wav' }),
      asset({ id: '2', name: 'Scene', kind: 'video', original_filename: 'scene-final.mp4' }),
    ]
    expect(findAccountAssetForTimelineItem(assets, 'Voiceover.WAV', 'audio')?.id).toBe('1')
    expect(findAccountAssetForTimelineItem(assets, 'scene-final', 'video')?.id).toBe('2')
    expect(findAccountAssetForTimelineItem(assets, 'missing', 'video')).toBeUndefined()
  })
})
