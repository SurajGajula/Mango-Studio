import { NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { PRO_MONTHLY_REQUESTS } from '@/app/lib/planLimits'

interface ProProfile {
  is_pro: boolean
  requests_remaining: number
}

type RequireProUserResult =
  | { user: { id: string }; profile: ProProfile }
  | { error: NextResponse }

interface RequireProUserOptions {
  consumeQuota?: boolean
}

export const quotaConsumingGenerationActions = new Set([
  'generate_image',
  'edit_image',
  'generate_video',
  'generate_speech',
  'transcribe_audio',
  'animate_to_speech',
])

async function consumeRequestQuota(userId: string, maxAttempts = 3): Promise<ProProfile | null> {
  const supabase = await createClient()

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro, requests_remaining')
      .eq('id', userId)
      .single()

    if (profileError || !profile || !profile.is_pro || profile.requests_remaining <= 0) {
      return null
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ requests_remaining: profile.requests_remaining - 1 })
      .eq('id', userId)
      .eq('is_pro', true)
      .eq('requests_remaining', profile.requests_remaining)
      .select('is_pro, requests_remaining')
      .maybeSingle()

    if (!updateError && updated) {
      return updated
    }
  }

  return null
}

function quotaLimitResponse(isPro: boolean): NextResponse {
  return NextResponse.json(
    {
      error: isPro
        ? `Pro request limit reached (${PRO_MONTHLY_REQUESTS}). Please contact support for more.`
        : 'Request limit reached. Please upgrade to Pro for more requests.',
      limitReached: true,
    },
    { status: 403 }
  )
}

export async function requireProUser(options?: RequireProUserOptions): Promise<RequireProUserResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (options?.consumeQuota) {
    const profile = await consumeRequestQuota(user.id)
    if (profile) {
      return { user, profile }
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro, requests_remaining')
      .eq('id', user.id)
      .single()

    if (profileError || !currentProfile) {
      return { error: NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 }) }
    }

    if (!currentProfile.is_pro) {
      return { error: NextResponse.json({ error: 'This feature requires a Pro subscription.' }, { status: 403 }) }
    }

    return { error: quotaLimitResponse(true) }
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
