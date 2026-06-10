import { NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'

interface ProProfile {
  is_pro: boolean
  requests_remaining: number
}

type RequireProUserResult =
  | { user: { id: string }; profile: ProProfile }
  | { error: NextResponse }

export async function requireProUser(): Promise<RequireProUserResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_pro, requests_remaining')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 }) }
  }

  if (!profile.is_pro) {
    return { error: NextResponse.json({ error: 'This feature requires a Pro subscription.' }, { status: 403 }) }
  }

  return { user, profile }
}
