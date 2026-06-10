function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function getAuthRedirectOrigin(): string {
  if (typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)) {
    return window.location.origin
  }
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
