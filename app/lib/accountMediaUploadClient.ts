import type { AccountMediaAsset } from '@/app/lib/accountMediaTypes'

export type UploadAccountMediaOptions = {
  file: File
  folderId?: string | null
  durationSeconds?: number
  storageScope?: 'default' | 'bg-removed'
  sourceAssetId?: string | null
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function cleanupFailedUpload(assetId: string): Promise<void> {
  await fetch(`/api/media/delete?assetId=${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
  }).catch(() => undefined)
}

export async function uploadAccountMedia(options: UploadAccountMediaOptions): Promise<AccountMediaAsset> {
  const { file, folderId, durationSeconds, storageScope, sourceAssetId } = options
  const arrayBuffer = await file.arrayBuffer()
  const contentHash = await sha256Hex(arrayBuffer)

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      contentHash,
      folderId: folderId ?? null,
      durationSeconds: durationSeconds ?? null,
      storageScope: storageScope ?? 'default',
      sourceAssetId: sourceAssetId ?? null,
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error ?? 'Upload failed')
  }

  const asset = body?.asset as AccountMediaAsset | undefined
  if (!asset?.id) {
    throw new Error('Upload response missing asset')
  }

  if (body?.deduplicated || !body?.uploadUrl) {
    return asset
  }

  const putResponse = await fetch(body.uploadUrl as string, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: arrayBuffer,
  })

  if (!putResponse.ok) {
    await cleanupFailedUpload(asset.id)
    throw new Error('Failed to upload media to storage')
  }

  return asset
}
