import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/utils/supabase/admin'
import { createClient } from '@/app/utils/supabase/server'

const TABLE_NAME = 'project_snapshots'
const SNAPSHOT_NAME = 'default'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABLE_NAME)
    .select('snapshot_json, updated_at')
    .eq('user_id', user.id)
    .eq('name', SNAPSHOT_NAME)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
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
  const snapshot = body?.snapshot
  if (!snapshot || typeof snapshot !== 'object') {
    return NextResponse.json({ error: 'Missing snapshot payload' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from(TABLE_NAME).upsert(
    {
      user_id: user.id,
      name: SNAPSHOT_NAME,
      snapshot_json: snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,name' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
