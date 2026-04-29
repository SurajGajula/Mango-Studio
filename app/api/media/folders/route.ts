import { NextRequest, NextResponse } from 'next/server'
import { BG_REMOVED_SYSTEM_FOLDER_NAME, findSystemFolderIds, isSystemFolderName } from '@/app/lib/accountMediaSystemFolders'
import { createClient } from '@/app/utils/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const all = req.nextUrl.searchParams.get('all')
  if (all !== '1') {
    return NextResponse.json({ error: 'Use ?all=1' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('media_folders')
    .select('*')
    .eq('user_id', user.id)
    .neq('name', BG_REMOVED_SYSTEM_FOLDER_NAME)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ folders: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const name = body?.name?.trim()
  const parentId = body?.parentId?.trim() || null

  if (!name) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
  }
  if (isSystemFolderName(name)) {
    return NextResponse.json({ error: 'Folder name is reserved' }, { status: 400 })
  }
  if (parentId) {
    const hiddenFolderIds = await findSystemFolderIds(user.id)
    if (hiddenFolderIds.includes(parentId)) {
      return NextResponse.json({ error: 'Cannot create folders in system folders' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('media_folders')
    .insert({
      user_id: user.id,
      parent_id: parentId,
      name,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ folder: data })
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
  const folderId = body?.folderId
  const name = body?.name?.trim()

  if (!folderId || !name) {
    return NextResponse.json({ error: 'folderId and name are required' }, { status: 400 })
  }
  if (isSystemFolderName(name)) {
    return NextResponse.json({ error: 'Folder name is reserved' }, { status: 400 })
  }
  const hiddenFolderIds = await findSystemFolderIds(user.id)
  if (hiddenFolderIds.includes(folderId)) {
    return NextResponse.json({ error: 'System folders cannot be renamed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('media_folders')
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', folderId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ folder: data })
}
