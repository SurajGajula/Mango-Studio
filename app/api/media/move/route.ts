import { NextRequest, NextResponse } from 'next/server'
import { findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import { createClient } from '@/app/utils/supabase/server'

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
  const folderIdRaw = body?.folderId

  if (!assetId) {
    return NextResponse.json({ error: 'assetId is required' }, { status: 400 })
  }

  const folderId =
    folderIdRaw === undefined || folderIdRaw === null || folderIdRaw === ''
      ? null
      : String(folderIdRaw)
  const hiddenFolderIds = await findSystemFolderIds(user.id)

  if (folderId) {
    if (hiddenFolderIds.includes(folderId)) {
      return NextResponse.json({ error: 'System folders cannot be used as move targets' }, { status: 400 })
    }
    const { data: folder, error: folderError } = await supabase
      .from('media_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .single()

    if (folderError || !folder) {
      return NextResponse.json({ error: folderError?.message ?? 'Folder not found' }, { status: 400 })
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
