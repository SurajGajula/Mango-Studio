import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/utils/supabase/admin'
import { createClient } from '@/app/utils/supabase/server'
import { resolveProjectId, saveProjectSnapshotJson } from '@/app/lib/projectServer'

const TABLE_NAME = 'project_snapshots'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestedProjectId = req.nextUrl.searchParams.get('projectId')
  const projectId = await resolveProjectId(user.id, requestedProjectId)
  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABLE_NAME)
    .select('snapshot_json, updated_at')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    projectId,
    snapshot: data?.snapshot_json ?? null,
    updatedAt: data?.updated_at ?? null,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const requestedProjectId =
    typeof body?.projectId === 'string' && body.projectId.trim().length > 0 ? body.projectId.trim() : null
  const projectId = await resolveProjectId(user.id, requestedProjectId)
  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const snapshot = body?.snapshot
  if (!snapshot || typeof snapshot !== 'object') {
    return NextResponse.json({ error: 'Missing snapshot payload' }, { status: 400 })
  }

  const saveError = await saveProjectSnapshotJson(user.id, projectId, snapshot as Record<string, unknown>)
  if (saveError) {
    return NextResponse.json({ error: saveError }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
