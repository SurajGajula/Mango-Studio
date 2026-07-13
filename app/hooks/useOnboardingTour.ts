'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasCompletedOnboarding, markOnboardingComplete } from '@/app/lib/onboardingStorage'
import { useManifestStore } from '@/app/stores/manifestStore'

type Options = {
  enabled?: boolean
  force?: boolean
}

export function useOnboardingTour(userId: string | null | undefined, ready: boolean, options: Options = {}) {
  const { enabled = true, force = false } = options
  const [active, setActive] = useState(false)
  const videos = useManifestStore((state) => state.videos)
  const images = useManifestStore((state) => state.images)

  const timelineIsEmpty = useMemo(
    () => videos.length === 0 && images.length === 0,
    [videos.length, images.length]
  )

  useEffect(() => {
    if (!enabled || !ready) {
      setActive(false)
      return
    }

    if (force) {
      setActive(true)
      return
    }

    if (!userId) {
      setActive(false)
      return
    }

    if (!timelineIsEmpty) {
      setActive(false)
      return
    }

    setActive(!hasCompletedOnboarding(userId))
  }, [enabled, force, ready, timelineIsEmpty, userId])

  const complete = useCallback(() => {
    if (userId) {
      markOnboardingComplete(userId)
    }
    setActive(false)
  }, [userId])

  const restart = useCallback(() => {
    setActive(true)
  }, [])

  return {
    active,
    complete,
    restart,
  }
}
