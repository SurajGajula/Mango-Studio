import { uploadAccountMedia } from '@/app/lib/accountMediaUploadClient'

const MAX_MEDIA_UPLOAD_DURATION_SEC = 600

export function accountMediaAssetPlaybackUrl(assetId: string): string {
  return `/api/media/asset/${assetId}`
}

export async function uploadToAccountLibrary(file: File, durationSeconds?: number): Promise<string | null> {
  try {
    const asset = await uploadAccountMedia({ file, durationSeconds })
    window.dispatchEvent(new Event('account-media-updated'))
    return asset.id
  } catch {
    return null
  }
}

export function validateMediaDuration(duration: number, typeLabel: 'Video' | 'Audio'): boolean {
  if (duration > MAX_MEDIA_UPLOAD_DURATION_SEC) {
    alert(`${typeLabel} uploads must be under 10 minutes.`)
    return false
  }
  return true
}
