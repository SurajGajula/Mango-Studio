export function getAuthRedirectOrigin(): string {
  const override = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN
  if (override && override.trim() !== '') {
    return override.replace(/\/$/, '')
  }
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.origin
}

export function getAuthCallbackUrl(): string {
  return `${getAuthRedirectOrigin()}/auth/callback`
}
