'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import AccountPanel from './AccountPanel'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './panels/TransitionsPanel'
import FontPanel from './panels/FontPanel'
import EffectsPanel from './panels/EffectsPanel'
import SpeedPanel from './panels/SpeedPanel'
import PitchPanel from './panels/PitchPanel'
import { useAuth } from './AuthProvider'
import { enablePreviewEngine } from '@/app/lib/playbackClock'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import {
  hydrateLocalProjectIfNeeded,
  useUserProjectPersistence,
} from '@/app/lib/projectPersistence'
import { useProjects } from '@/app/hooks/useProjects'
import styles from './MainView.module.css'

const Timeline = dynamic(() => import('./Timeline'), {
  ssr: false,
  loading: () => <div className={styles.timelineSkeleton} aria-hidden />,
})

const ChatWindow = dynamic(() => import('./ChatWindow'), {
  ssr: false,
  loading: () => <div className={styles.chatSkeleton} aria-busy="true" />,
})

type RightPanel = 'chat' | 'transitions' | 'animations' | 'font' | 'effects' | 'speed' | 'pitch'

export default function MainView() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('chat')
  const [transitionItemId, setTransitionItemId] = useState<string | null>(null)
  const [speedItemId, setSpeedItemId] = useState<string | null>(null)
  const [pitchItemId, setPitchItemId] = useState<string | null>(null)
  const [localPersistReady, setLocalPersistReady] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const { user, loading } = useAuth()
  const { projects, activeProjectId, setActiveProjectId, ready: projectsReady } = useProjects(user?.id ?? null)
  const videos = useManifestStore((s) => s.videos)
  const images = useManifestStore((s) => s.images)
  const audios = useManifestStore((s) => s.audios)
  const selectedImageId = useSelectionStore((s) => s.selectedImageId)
  const selectedVideoId = useSelectionStore((s) => s.selectedVideoId)
  const selectedTextId = useSelectionStore((s) => s.selectedTextId)
  const selectedAudioId = useSelectionStore((s) => s.selectedAudioId)
  const selectVideo = useSelectionStore((s) => s.selectVideo)
  const selectImage = useSelectionStore((s) => s.selectImage)
  const selectAudio = useSelectionStore((s) => s.selectAudio)

  const hydrationTokenRef = useRef(0)
  const hydratedProjectRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('./ChatWindow').then(() => {
      if (!cancelled) setChatReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (loading) return
    let cancelled = false
    const token = ++hydrationTokenRef.current
    void (async () => {
      if (!user || !projectsReady || !activeProjectId) return
      if (hydratedProjectRef.current !== activeProjectId) {
        if (!cancelled) setLocalPersistReady(false)
        useManifestStore.getState().resetStore()
        useSelectionStore.getState().clearSelection()
        await hydrateLocalProjectIfNeeded(user, activeProjectId)
        hydratedProjectRef.current = activeProjectId
      }
      if (token !== hydrationTokenRef.current) return
      if (!cancelled) setLocalPersistReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user, projectsReady, activeProjectId])

  useEffect(() => {
    if (localPersistReady) enablePreviewEngine()
  }, [localPersistReady])

  useUserProjectPersistence(localPersistReady ? user : null, activeProjectId)

  useEffect(() => {
    if (rightPanel === 'chat' || rightPanel === 'effects') return

    if (rightPanel === 'speed') {
      const currentSelectedId = selectedVideoId || selectedAudioId
      if (currentSelectedId) {
        if (currentSelectedId !== speedItemId) {
          setSpeedItemId(currentSelectedId)
        }
      } else if (!speedItemId) {
        setRightPanel('chat')
        setSpeedItemId(null)
      }
    } else if (rightPanel === 'pitch') {
      if (selectedAudioId) {
        if (selectedAudioId !== pitchItemId) {
          setPitchItemId(selectedAudioId)
        }
      } else if (!pitchItemId) {
        setRightPanel('chat')
        setPitchItemId(null)
      }
    } else if (rightPanel === 'animations') {
      const currentSelectedId = selectedVideoId || selectedImageId
      if (currentSelectedId) {
        if (currentSelectedId !== transitionItemId) {
          setTransitionItemId(currentSelectedId)
        }
      } else {
        setRightPanel('chat')
        setTransitionItemId(null)
      }
    } else if (rightPanel === 'transitions') {
      const currentSelectedId = selectedVideoId || selectedImageId
      if (currentSelectedId) {
        if (!transitionItemId) {
          setTransitionItemId(currentSelectedId)
        }
      } else if (!transitionItemId) {
        setRightPanel('chat')
        setTransitionItemId(null)
      }
    } else if (rightPanel === 'font') {
      if (!selectedTextId) {
        setRightPanel('chat')
      }
    }
  }, [selectedVideoId, selectedImageId, selectedTextId, selectedAudioId, rightPanel, speedItemId, pitchItemId, transitionItemId])

  const onOpenTransitions = useCallback((id: string) => {
    setRightPanel('transitions')
    setTransitionItemId(id)
  }, [])

  const onOpenAnimations = useCallback((id?: string) => {
    setRightPanel('animations')
    if (id) {
      setTransitionItemId(id)
      const isVideo = videos.some((v) => v.id === id)
      if (isVideo) selectVideo(id)
      else {
        const isImage = images.some((i) => i.id === id)
        if (isImage) selectImage(id)
      }
    }
  }, [videos, images, selectVideo, selectImage])

  const onOpenFont = useCallback(() => setRightPanel('font'), [])
  const onOpenEffects = useCallback(() => setRightPanel('effects'), [])
  const onOpenSpeed = useCallback(
    (id: string) => {
      setRightPanel('speed')
      setSpeedItemId(id)
      const isVideo = videos.some((v) => v.id === id)
      if (isVideo) selectVideo(id)
      else {
        const isAudio = audios.some((a) => a.id === id)
        if (isAudio) selectAudio(id)
      }
    },
    [videos, audios, selectVideo, selectAudio]
  )

  const onOpenPitch = useCallback(
    (id: string) => {
      setRightPanel('pitch')
      setPitchItemId(id)
      const isAudio = audios.some((a) => a.id === id)
      if (isAudio) selectAudio(id)
    },
    [audios, selectAudio]
  )

  const showChatPanel = rightPanel === 'chat'
  const isProjectLoading =
    !projectsReady || (!!activeProjectId && !localPersistReady) || !chatReady

  const renderActivePanel = () => {
    if (rightPanel === 'transitions') {
      return (
        <TransitionsPanel
          key={`transition-${transitionItemId}`}
          mode="transition"
          itemId={transitionItemId || undefined}
          onClose={() => setRightPanel('chat')}
        />
      )
    }
    if (rightPanel === 'animations') {
      return (
        <TransitionsPanel
          key={`animation-${transitionItemId || selectedImageId || selectedVideoId}`}
          mode="animation"
          itemId={transitionItemId || undefined}
          onClose={() => setRightPanel('chat')}
        />
      )
    }
    if (rightPanel === 'font') return <FontPanel onClose={() => setRightPanel('chat')} />
    if (rightPanel === 'effects') return <EffectsPanel onClose={() => setRightPanel('chat')} />
    if (rightPanel === 'speed') {
      return <SpeedPanel key={`speed-${speedItemId}`} itemId={speedItemId || ''} onClose={() => setRightPanel('chat')} />
    }
    if (rightPanel === 'pitch') {
      return <PitchPanel key={`pitch-${pitchItemId}`} itemId={pitchItemId || ''} onClose={() => setRightPanel('chat')} />
    }
    return null
  }

  return (
    <div className={styles.container}>
      <div className={styles.topRow}>
        <div className={styles.accountSection}>
          <AccountPanel
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
          />
        </div>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.rightSection}>
          <div className={styles.rightPanelStack}>
            <div className={`${styles.persistentChatPanel} ${showChatPanel ? '' : styles.hiddenPanel}`}>
              <ChatWindow />
            </div>
            {!showChatPanel && <div className={styles.overlayPanel}>{renderActivePanel()}</div>}
          </div>
        </div>
      </div>
      <div className={styles.timelineContainer}>
        <Timeline
          onOpenTransitions={onOpenTransitions}
          onOpenAnimations={onOpenAnimations}
          onOpenFont={onOpenFont}
          onOpenEffects={onOpenEffects}
          onOpenSpeed={onOpenSpeed}
          onOpenPitch={onOpenPitch}
        />
      </div>
      {isProjectLoading && (
        <div className={styles.loadingOverlay} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.loadingContent}>
            <div className={styles.spinner} aria-hidden />
            <span className={styles.loadingLabel}>Loading project…</span>
          </div>
        </div>
      )}
    </div>
  )
}
