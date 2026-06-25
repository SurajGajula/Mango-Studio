import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getR2Client } from '@/app/lib/r2Client'

type R2Client = ReturnType<typeof getR2Client>

const R2_DELETE_CHUNK_SIZE = 1000

export async function deleteMediaAsset(
  supabase: SupabaseClient,
  r2: R2Client,
  userId: string,
  assetId: string,
  hiddenFolderIds: string[]
): Promise<void> {
  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('id, object_key, folder_id')
    .eq('id', assetId)
    .eq('user_id', userId)
    .single()

  if (assetError || !asset) {
    throw new Error(assetError?.message ?? 'Asset not found')
  }
  if (asset.folder_id && hiddenFolderIds.includes(asset.folder_id)) {
    throw new Error('Assets in system folders cannot be deleted directly')
  }

  await r2.client.send(
    new DeleteObjectCommand({
      Bucket: r2.bucketName,
      Key: asset.object_key,
    })
  )

  const { error: deleteError } = await supabase
    .from('media_assets')
    .delete()
    .eq('id', asset.id)
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }
}

export async function deleteMediaFolder(
  supabase: SupabaseClient,
  userId: string,
  folderId: string,
  hiddenFolderIds: string[]
): Promise<void> {
  if (hiddenFolderIds.includes(folderId)) {
    throw new Error('System folders cannot be deleted')
  }

  const [{ count: childFolderCount }, { count: childAssetCount }] = await Promise.all([
    supabase
      .from('media_folders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('parent_id', folderId),
    supabase
      .from('media_assets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('folder_id', folderId),
  ])

  if ((childFolderCount ?? 0) > 0 || (childAssetCount ?? 0) > 0) {
    throw new Error('Folder must be empty before deleting')
  }

  const { error: deleteError } = await supabase
    .from('media_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }
}

export async function batchDeleteMediaAssets(
  supabase: SupabaseClient,
  r2: R2Client,
  userId: string,
  assetIds: string[],
  hiddenFolderIds: string[]
): Promise<number> {
  if (assetIds.length === 0) return 0

  const uniqueAssetIds = [...new Set(assetIds)]
  const { data: assets, error: assetsError } = await supabase
    .from('media_assets')
    .select('id, object_key, folder_id')
    .eq('user_id', userId)
    .in('id', uniqueAssetIds)

  if (assetsError) {
    throw new Error(assetsError.message)
  }

  if (!assets || assets.length !== uniqueAssetIds.length) {
    throw new Error('One or more assets were not found')
  }

  for (const asset of assets) {
    if (asset.folder_id && hiddenFolderIds.includes(asset.folder_id)) {
      throw new Error('Assets in system folders cannot be deleted directly')
    }
  }

  const objectKeys = assets.map((asset) => asset.object_key)
  for (let i = 0; i < objectKeys.length; i += R2_DELETE_CHUNK_SIZE) {
    const chunk = objectKeys.slice(i, i + R2_DELETE_CHUNK_SIZE)
    await r2.client.send(
      new DeleteObjectsCommand({
        Bucket: r2.bucketName,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    )
  }

  const { error: deleteError } = await supabase
    .from('media_assets')
    .delete()
    .eq('user_id', userId)
    .in('id', uniqueAssetIds)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  return uniqueAssetIds.length
}

export async function batchDeleteMediaFolders(
  supabase: SupabaseClient,
  userId: string,
  folderIds: string[],
  hiddenFolderIds: string[]
): Promise<number> {
  if (folderIds.length === 0) return 0

  const uniqueFolderIds = [...new Set(folderIds)]
  for (const folderId of uniqueFolderIds) {
    await deleteMediaFolder(supabase, userId, folderId, hiddenFolderIds)
  }

  return uniqueFolderIds.length
}
