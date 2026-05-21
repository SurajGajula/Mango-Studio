const MAX_MEDIA_UPLOAD_DURATION_SEC = 600

export function accountMediaAssetPlaybackUrl(assetId: string): string {
  return `/api/media/asset/${assetId}`
}

export async function uploadToAccountLibrary(file: File, durationSeconds?: number): Promise<string | null> {
  const formData = new FormData()
  formData.append('file', file)
  if (durationSeconds !== undefined) {
    formData.append('durationSeconds', String(durationSeconds))
  }
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    return null
  }
  let assetId: string | null = null
  try {
    const data = (await response.json()) as { asset?: { id: string } }
    assetId = data.asset?.id ?? null
  } catch {
    assetId = null
  }
  window.dispatchEvent(new Event('account-media-updated'))
  return assetId
}

export function validateMediaDuration(duration: number, typeLabel: 'Video' | 'Audio'): boolean {
  if (duration > MAX_MEDIA_UPLOAD_DURATION_SEC) {
    alert(`${typeLabel} uploads must be under 10 minutes.`)
    return false
  }
  return true
}
