import { NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { ensureUserProfile } from '@/app/lib/ensureUserProfile'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureUserProfile(user.id)

  return NextResponse.json({ ok: true })
}
