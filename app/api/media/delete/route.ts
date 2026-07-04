import { NextRequest, NextResponse } from 'next/server'
import { findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import {
  batchDeleteMediaAssets,
  batchDeleteMediaFolders,
  deleteMediaAsset,
  deleteMediaFolder,
} from '@/app/lib/accountMediaDelete'
import { getR2Client } from '@/app/lib/r2Client'
import { createClient } from '@/app/utils/supabase/server'

function parseIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'R2 is not configured'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const hiddenFolderIds = await findSystemFolderIds(user.id)
  const contentType = req.headers.get('content-type') ?? ''
  const assetId = req.nextUrl.searchParams.get('assetId')
  const folderId = req.nextUrl.searchParams.get('folderId')

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => null)
    const assetIds = parseIdList(body?.assetIds)
    const folderIds = parseIdList(body?.folderIds)

    if (assetIds.length === 0 && folderIds.length === 0) {
      return NextResponse.json({ error: 'assetIds or folderIds is required' }, { status: 400 })
    }

    try {
      const deletedAssetCount = await batchDeleteMediaAssets(supabase, r2, user.id, assetIds, hiddenFolderIds)
      const deletedFolderCount = await batchDeleteMediaFolders(supabase, r2, user.id, folderIds, hiddenFolderIds)
      return NextResponse.json({
        ok: true,
        deletedAssetCount,
        deletedFolderCount,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete library items'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  if (assetId) {
    try {
      await deleteMediaAsset(supabase, r2, user.id, assetId, hiddenFolderIds)
      return NextResponse.json({ ok: true })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete asset'
      const status = message === 'Asset not found' ? 404 : 400
      return NextResponse.json({ error: message }, { status })
    }
  }

  if (folderId) {
    try {
      await deleteMediaFolder(supabase, r2, user.id, folderId, hiddenFolderIds)
      return NextResponse.json({ ok: true })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete folder'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'assetId or folderId is required' }, { status: 400 })
}
