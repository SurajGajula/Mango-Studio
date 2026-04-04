const fileKeyToUrl = new Map<string, string>()

function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function getOrCreateObjectURLForFile(file: File): string {
  const key = fileFingerprint(file)
  const existing = fileKeyToUrl.get(key)
  if (existing) return existing
  const url = URL.createObjectURL(file)
  fileKeyToUrl.set(key, url)
  return url
}

export function forgetFileObjectUrlIfRevoked(url: string): void {
  for (const [key, u] of fileKeyToUrl) {
    if (u === url) fileKeyToUrl.delete(key)
  }
}

export function clearFileObjectUrlCache(): void {
  for (const url of fileKeyToUrl.values()) {
    URL.revokeObjectURL(url)
  }
  fileKeyToUrl.clear()
}
