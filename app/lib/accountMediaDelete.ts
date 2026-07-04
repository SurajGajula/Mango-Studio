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

async function collectDescendantFolderIds(
  supabase: SupabaseClient,
  userId: string,
  rootFolderId: string,
  hiddenFolderIds: string[]
): Promise<string[]> {
  const descendantIds: string[] = []
  const queue = [rootFolderId]

  while (queue.length > 0) {
    const parentId = queue.shift()!
    const { data: children, error } = await supabase
      .from('media_folders')
      .select('id')
      .eq('user_id', userId)
      .eq('parent_id', parentId)

    if (error) {
      throw new Error(error.message)
    }

    for (const child of children ?? []) {
      const childId = child.id as string
      if (hiddenFolderIds.includes(childId)) {
        throw new Error('System folders cannot be deleted')
      }
      descendantIds.push(childId)
      queue.push(childId)
    }
  }

  return descendantIds
}

export async function deleteMediaFolder(
  supabase: SupabaseClient,
  r2: R2Client,
  userId: string,
  folderId: string,
  hiddenFolderIds: string[]
): Promise<void> {
  if (hiddenFolderIds.includes(folderId)) {
    throw new Error('System folders cannot be deleted')
  }

  const descendantIds = await collectDescendantFolderIds(supabase, userId, folderId, hiddenFolderIds)
  const folderIds = [folderId, ...descendantIds]

  const { data: assets, error: assetsError } = await supabase
    .from('media_assets')
    .select('id')
    .eq('user_id', userId)
    .in('folder_id', folderIds)

  if (assetsError) {
    throw new Error(assetsError.message)
  }

  if (assets && assets.length > 0) {
    await batchDeleteMediaAssets(
      supabase,
      r2,
      userId,
      assets.map((asset) => asset.id as string),
      hiddenFolderIds
    )
  }

  for (const id of [...folderIds].reverse()) {
    const { error: deleteError } = await supabase
      .from('media_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (deleteError) {
      throw new Error(deleteError.message)
    }
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
  r2: R2Client,
  userId: string,
  folderIds: string[],
  hiddenFolderIds: string[]
): Promise<number> {
  if (folderIds.length === 0) return 0

  const uniqueFolderIds = [...new Set(folderIds)]
  for (const folderId of uniqueFolderIds) {
    await deleteMediaFolder(supabase, r2, userId, folderId, hiddenFolderIds)
  }

  return uniqueFolderIds.length
}
