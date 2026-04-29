import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import { getR2Client } from '@/app/lib/r2Client'
import { createClient } from '@/app/utils/supabase/server'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let r2
  try {
    r2 = getR2Client()
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'R2 is not configured' }, { status: 500 })
  }

  const assetId = req.nextUrl.searchParams.get('assetId')
  const folderId = req.nextUrl.searchParams.get('folderId')
  const hiddenFolderIds = await findSystemFolderIds(user.id)

  if (assetId) {
    const { data: asset, error: assetError } = await supabase
      .from('media_assets')
      .select('id, object_key, folder_id')
      .eq('id', assetId)
      .eq('user_id', user.id)
      .single()

    if (assetError || !asset) {
      return NextResponse.json({ error: assetError?.message ?? 'Asset not found' }, { status: 404 })
    }
    if (asset.folder_id && hiddenFolderIds.includes(asset.folder_id)) {
      return NextResponse.json({ error: 'Assets in system folders cannot be deleted directly' }, { status: 400 })
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
      .eq('user_id', user.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (folderId) {
    if (hiddenFolderIds.includes(folderId)) {
      return NextResponse.json({ error: 'System folders cannot be deleted' }, { status: 400 })
    }
    const [{ count: childFolderCount }, { count: childAssetCount }] = await Promise.all([
      supabase
        .from('media_folders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('parent_id', folderId),
      supabase
        .from('media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('folder_id', folderId),
    ])

    if ((childFolderCount ?? 0) > 0 || (childAssetCount ?? 0) > 0) {
      return NextResponse.json({ error: 'Folder must be empty before deleting' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('media_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', user.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'assetId or folderId is required' }, { status: 400 })
}
