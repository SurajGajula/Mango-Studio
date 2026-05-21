import type { AccountMediaAsset, AccountMediaKind } from '@/app/lib/accountMediaTypes'
import { accountMediaAssetPlaybackUrl } from '@/app/lib/timeline/mediaUploadUtils'
import { resolveAudioDurationFromUrl } from '@/app/lib/timelineMediaInsert'
import { resolveVideoMetadata } from '@/app/lib/mediaUtils'

export function normalizeMediaLabel(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const dot = trimmed.lastIndexOf('.')
  if (dot > 0) return trimmed.slice(0, dot)
  return trimmed
}

export function assetIdFromPlaybackUrl(url: string | undefined): string | null {
  if (!url) return null
  const match = url.match(/\/api\/media\/asset\/([^/?#]+)/)
  return match?.[1] ?? null
}

export function findAccountAssetForTimelineItem(
  assets: AccountMediaAsset[],
  label: string,
  kind: AccountMediaKind,
  playbackUrl?: string
): AccountMediaAsset | undefined {
  const assetId = assetIdFromPlaybackUrl(playbackUrl)
  if (assetId) {
    const byId = assets.find((asset) => asset.id === assetId && asset.kind === kind)
    if (byId) return byId
  }
  const norm = normalizeMediaLabel(label)
  return assets.find(
    (asset) =>
      asset.kind === kind &&
      (normalizeMediaLabel(asset.name) === norm || normalizeMediaLabel(asset.original_filename) === norm)
  )
}

export async function fetchAllAccountMediaAssets(): Promise<AccountMediaAsset[]> {
  const res = await fetch('/api/media/list?all=1', { method: 'GET', credentials: 'include' })
  if (!res.ok) return []
  const body = (await res.json().catch(() => null)) as { assets?: AccountMediaAsset[] } | null
  return body?.assets ?? []
}

export type ResolvedTimelineLibraryMedia = {
  assetId: string
  url: string
  duration: number
}

async function resolveAssetDurationSeconds(
  asset: AccountMediaAsset,
  playbackUrl: string
): Promise<number> {
  if (asset.duration_seconds !== null && asset.duration_seconds > 0) {
    return asset.duration_seconds
  }
  if (asset.kind === 'video') {
    const { duration } = await resolveVideoMetadata(playbackUrl)
    return duration
  }
  if (asset.kind === 'audio') {
    return resolveAudioDurationFromUrl(playbackUrl)
  }
  return 0
}

export async function resolveTimelineFullMediaFromLibrary(
  label: string,
  kind: AccountMediaKind,
  assets?: AccountMediaAsset[],
  playbackUrl?: string
): Promise<ResolvedTimelineLibraryMedia | null> {
  const list = assets ?? (await fetchAllAccountMediaAssets())
  const asset = findAccountAssetForTimelineItem(list, label, kind, playbackUrl)
  if (!asset) return null
  const url = accountMediaAssetPlaybackUrl(asset.id)
  const duration = await resolveAssetDurationSeconds(asset, url)
  if (!(duration > 0)) return null
  return { assetId: asset.id, url, duration }
}
