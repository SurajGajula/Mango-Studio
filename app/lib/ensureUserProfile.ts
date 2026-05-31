import { createAdminClient } from '@/app/utils/supabase/admin'
import { FREE_MONTHLY_REQUESTS, PRO_MONTHLY_REQUESTS } from '@/app/lib/planLimits'

export async function ensureUserProfile(userId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_pro, requests_remaining, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    const { error } = await admin.from('profiles').insert({
      id: userId,
      is_pro: false,
      requests_remaining: FREE_MONTHLY_REQUESTS,
    })
    if (error) throw error
    return
  }

  if (
    !profile.is_pro &&
    !profile.stripe_subscription_id &&
    profile.requests_remaining === PRO_MONTHLY_REQUESTS
  ) {
    const { error } = await admin
      .from('profiles')
      .update({ requests_remaining: FREE_MONTHLY_REQUESTS })
      .eq('id', userId)
    if (error) throw error
  }
}
