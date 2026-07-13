import { beforeEach, describe, expect, it } from 'vitest'
import {
  onboardingStorageKey,
  ONBOARDING_STORAGE_VERSION,
  hasCompletedOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from '@/app/lib/onboardingStorage'

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

describe('onboardingStorage', () => {
  const userId = 'user-123'

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorageMock() },
      configurable: true,
    })
  })

  it('uses a versioned storage key', () => {
    expect(onboardingStorageKey(userId)).toBe(`mango-onboarding-${ONBOARDING_STORAGE_VERSION}:${userId}`)
  })

  it('tracks completion per user', () => {
    expect(hasCompletedOnboarding(userId)).toBe(false)
    markOnboardingComplete(userId)
    expect(hasCompletedOnboarding(userId)).toBe(true)
  })

  it('can reset onboarding state', () => {
    markOnboardingComplete(userId)
    resetOnboarding(userId)
    expect(hasCompletedOnboarding(userId)).toBe(false)
  })
})
