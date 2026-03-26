'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'

export function useSliderHistorySession() {
  const activeRef = useRef(false)
  const onUpRef = useRef<(() => void) | null>(null)

  const finish = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    const st = useManifestStore.getState()
    st.resumeHistory()
    st.pushHistory()
  }, [])

  useEffect(
    () => () => {
      if (onUpRef.current) {
        window.removeEventListener('pointerup', onUpRef.current, true)
        window.removeEventListener('pointercancel', onUpRef.current, true)
        onUpRef.current = null
      }
      if (!activeRef.current) return
      activeRef.current = false
      const st = useManifestStore.getState()
      st.resumeHistory()
      st.pushHistory()
    },
    []
  )

  const onPointerDown = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    useManifestStore.getState().pauseHistory()
    const onUp = () => {
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      onUpRef.current = null
      finish()
    }
    onUpRef.current = onUp
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
  }, [finish])

  return onPointerDown
}
