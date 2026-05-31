import { createHash } from 'crypto'
import type { AccountMediaAsset, AccountMediaKind } from '@/app/lib/accountMediaTypes'
import { findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import { createAdminClient } from '@/app/utils/supabase/admin'

export function computeMediaContentHash(buffer: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex')
}

function isVisibleLibraryAsset(asset: AccountMediaAsset, hiddenFolderIds: string[]): boolean {
  if (asset.folder_id && hiddenFolderIds.includes(asset.folder_id)) return false
  return true
}

export async function findExistingUploadedAsset(
  userId: string,
  params: {
    kind: AccountMediaKind
    contentHash: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
  }
): Promise<AccountMediaAsset | null> {
  const admin = createAdminClient()
  const hiddenFolderIds = await findSystemFolderIds(userId)

  const { data: byHash, error: hashError } = await admin
    .from('media_assets')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', params.kind)
    .eq('content_hash', params.contentHash)
    .order('created_at', { ascending: true })

  if (hashError) {
    throw hashError
  }

  const hashMatch = (byHash ?? []).find((asset) =>
    isVisibleLibraryAsset(asset as AccountMediaAsset, hiddenFolderIds)
  )
  if (hashMatch) {
    return hashMatch as AccountMediaAsset
  }

  const { data: byMetadata, error: metadataError } = await admin
    .from('media_assets')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', params.kind)
    .eq('original_filename', params.originalFilename)
    .eq('mime_type', params.mimeType)
    .eq('size_bytes', params.sizeBytes)
    .is('content_hash', null)
    .order('created_at', { ascending: true })

  if (metadataError) {
    throw metadataError
  }

  const metadataMatch = (byMetadata ?? []).find((asset) =>
    isVisibleLibraryAsset(asset as AccountMediaAsset, hiddenFolderIds)
  )
  return (metadataMatch as AccountMediaAsset) ?? null
}
