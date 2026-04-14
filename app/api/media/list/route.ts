import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderIdParam = req.nextUrl.searchParams.get('folderId')
  const folderId = folderIdParam && folderIdParam.length > 0 ? folderIdParam : null
  const search = req.nextUrl.searchParams.get('search')?.trim() ?? ''

  let foldersQuery = supabase
    .from('media_folders')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (folderId) {
    foldersQuery = foldersQuery.eq('parent_id', folderId)
  } else {
    foldersQuery = foldersQuery.is('parent_id', null)
  }

  const { data: folders, error: foldersError } = await foldersQuery
  if (foldersError) {
    return NextResponse.json({ error: foldersError.message }, { status: 500 })
  }

  let assetsQuery = supabase
    .from('media_assets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (search) {
    assetsQuery = assetsQuery.ilike('name', `%${search}%`)
  } else if (folderId) {
    assetsQuery = assetsQuery.eq('folder_id', folderId)
  } else {
    assetsQuery = assetsQuery.is('folder_id', null)
  }

  const { data: assets, error: assetsError } = await assetsQuery
  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 })
  }

  return NextResponse.json({
    folders: folders ?? [],
    assets: assets ?? [],
  })
}
