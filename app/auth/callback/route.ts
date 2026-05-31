import { NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { ensureUserProfile } from '@/app/lib/ensureUserProfile'

function getPostAuthRedirectOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = url.hostname
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'

  if (isLoopback || process.env.NODE_ENV === 'development') {
    return url.origin
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const hostPart = forwardedHost.split(',')[0].trim()
    return `${proto}://${hostPart}`
  }

  return url.origin
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { searchParams } = url
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const redirectOrigin = getPostAuthRedirectOrigin(request)

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await ensureUserProfile(data.user.id)
      return NextResponse.redirect(`${redirectOrigin}${next}`)
    }
  }

  return NextResponse.redirect(`${redirectOrigin}/auth/auth-code-error`)
}
