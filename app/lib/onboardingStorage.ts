export const ONBOARDING_STORAGE_VERSION = 'v1'

export function onboardingStorageKey(userId: string): string {
  return `mango-onboarding-${ONBOARDING_STORAGE_VERSION}:${userId}`
}

export function hasCompletedOnboarding(userId: string | null | undefined): boolean {
  if (!userId || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(onboardingStorageKey(userId)) === 'done'
  } catch {
    return false
  }
}

export function markOnboardingComplete(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(onboardingStorageKey(userId), 'done')
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function resetOnboarding(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(onboardingStorageKey(userId))
  } catch {
    // Ignore quota / private mode errors.
  }
}
