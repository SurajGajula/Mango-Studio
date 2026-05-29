export const PERSISTED_BLOB_TOKEN_PREFIX = '__PERSIST_BLOB:'

const LEGACY_PERSISTED_BLOB_TOKEN_PREFIX = '__GUESTPERSIST_BLOB:'

export function isPersistedBlobTokenRef(value: string): boolean {
  return (
    value.startsWith(PERSISTED_BLOB_TOKEN_PREFIX)
    || value.startsWith(LEGACY_PERSISTED_BLOB_TOKEN_PREFIX)
  )
}

export function needsPersistedMediaUrlRepair(url: string | undefined): boolean {
  if (!url) return false
  if (isPersistedBlobTokenRef(url)) return true
  return url.startsWith('blob:')
}

export function isPlaybackFetchableUrl(url: string | undefined): boolean {
  if (!url) return false
  return !needsPersistedMediaUrlRepair(url)
}
