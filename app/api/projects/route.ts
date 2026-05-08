import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/utils/supabase/admin'
import { createClient } from '@/app/utils/supabase/server'
import { ensureUserHasProject, listUserProjects } from '@/app/lib/projectServer'

const TABLE_NAME = 'projects'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureUserHasProject(user.id)
  const projects = await listUserProjects(user.id)
  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABLE_NAME)
    .insert({
      user_id: user.id,
      name,
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create project' }, { status: 500 })
  }
  return NextResponse.json({ project: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!projectId || !name) {
    return NextResponse.json({ error: 'projectId and name are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABLE_NAME)
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to rename project' }, { status: 500 })
  }
  return NextResponse.json({ project: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const projects = await listUserProjects(user.id)
  if (projects.length <= 1) {
    return NextResponse.json({ error: 'At least one project is required' }, { status: 400 })
  }

  const { error: snapshotDeleteError } = await admin
    .from('project_snapshots')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId)
  if (snapshotDeleteError) {
    return NextResponse.json({ error: snapshotDeleteError.message }, { status: 500 })
  }

  const { error } = await admin.from(TABLE_NAME).delete().eq('id', projectId).eq('user_id', user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const nextProjects = await listUserProjects(user.id)
  return NextResponse.json({ projects: nextProjects })
}
