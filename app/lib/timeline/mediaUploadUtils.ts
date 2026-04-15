const MAX_MEDIA_UPLOAD_DURATION_SEC = 600

export async function uploadToAccountLibrary(file: File, durationSeconds?: number): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  if (durationSeconds !== undefined) {
    formData.append('durationSeconds', String(durationSeconds))
  }
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  })
  if (response.ok) {
    window.dispatchEvent(new Event('account-media-updated'))
  }
}

export function validateMediaDuration(duration: number, typeLabel: 'Video' | 'Audio'): boolean {
  if (duration > MAX_MEDIA_UPLOAD_DURATION_SEC) {
    alert(`${typeLabel} uploads must be under 10 minutes.`)
    return false
  }
  return true
}
