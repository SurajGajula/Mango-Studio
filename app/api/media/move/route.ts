import { NextRequest, NextResponse } from 'next/server'
import { wouldCreateFolderCycle } from '@/app/lib/accountMediaFolderTree'
import { findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import { createClient } from '@/app/utils/supabase/server'

function parseOptionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

async function validateTargetFolder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  folderId: string,
  hiddenFolderIds: string[]
) {
  if (hiddenFolderIds.includes(folderId)) {
    return { error: 'System folders cannot be used as move targets' }
  }
  const { data: folder, error: folderError } = await supabase
    .from('media_folders')
    .select('id')
    .eq('id', folderId)
    .eq('user_id', userId)
    .single()

  if (folderError || !folder) {
    return { error: folderError?.message ?? 'Folder not found' }
  }
  return null
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const assetId = body?.assetId
  const sourceFolderId = body?.folderId
  const hiddenFolderIds = await findSystemFolderIds(user.id)

  if (assetId) {
    const folderId = parseOptionalId(body?.folderId)

    if (folderId) {
      const targetError = await validateTargetFolder(supabase, user.id, folderId, hiddenFolderIds)
      if (targetError) {
        return NextResponse.json({ error: targetError.error }, { status: 400 })
      }
    }

    const { data: existingAsset, error: existingAssetError } = await supabase
      .from('media_assets')
      .select('id, folder_id')
      .eq('id', assetId)
      .eq('user_id', user.id)
      .single()
    if (existingAssetError || !existingAsset) {
      return NextResponse.json({ error: existingAssetError?.message ?? 'Asset not found' }, { status: 404 })
    }
    if (existingAsset.folder_id && hiddenFolderIds.includes(existingAsset.folder_id)) {
      return NextResponse.json({ error: 'Assets in system folders cannot be moved' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('media_assets')
      .update({
        folder_id: folderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ asset: data })
  }

  if (sourceFolderId) {
    if (!Object.prototype.hasOwnProperty.call(body, 'parentId')) {
      return NextResponse.json({ error: 'parentId is required when moving a folder' }, { status: 400 })
    }

    const parentId = parseOptionalId(body.parentId)
    if (hiddenFolderIds.includes(sourceFolderId)) {
      return NextResponse.json({ error: 'System folders cannot be moved' }, { status: 400 })
    }

    const { data: existingFolder, error: existingFolderError } = await supabase
      .from('media_folders')
      .select('id, parent_id')
      .eq('id', sourceFolderId)
      .eq('user_id', user.id)
      .single()
    if (existingFolderError || !existingFolder) {
      return NextResponse.json({ error: existingFolderError?.message ?? 'Folder not found' }, { status: 404 })
    }
    if ((existingFolder.parent_id ?? null) === parentId) {
      return NextResponse.json({ folder: existingFolder })
    }

    if (parentId) {
      const targetError = await validateTargetFolder(supabase, user.id, parentId, hiddenFolderIds)
      if (targetError) {
        return NextResponse.json({ error: targetError.error }, { status: 400 })
      }
    }

    const { data: allFolders, error: allFoldersError } = await supabase
      .from('media_folders')
      .select('id, parent_id')
      .eq('user_id', user.id)
    if (allFoldersError) {
      return NextResponse.json({ error: allFoldersError.message }, { status: 500 })
    }

    if (wouldCreateFolderCycle(allFolders ?? [], sourceFolderId, parentId)) {
      return NextResponse.json({ error: 'Cannot move a folder into itself or its subfolders' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('media_folders')
      .update({
        parent_id: parentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceFolderId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ folder: data })
  }

  return NextResponse.json({ error: 'assetId or folderId is required' }, { status: 400 })
}
