'use client'

import { useState, useCallback, useEffect } from 'react'
import ChatWindow from './ChatWindow'
import ChatDisabledPlaceholder from './ChatDisabledPlaceholder'
import AccountPanel from './AccountPanel'
import AuthModal from './modals/AuthModal'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './panels/TransitionsPanel'
import FontPanel from './panels/FontPanel'
import EffectsPanel from './panels/EffectsPanel'
import SpeedPanel from './panels/SpeedPanel'
import PitchPanel from './panels/PitchPanel'
import { useAuth } from './AuthProvider'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import {
  hydrateLocalProjectIfNeeded,
  useGuestProjectPersistence,
  useUserProjectPersistence,
} from '@/app/lib/projectPersistence'
import styles from './MainView.module.css'

type RightPanel = 'chat' | 'transitions' | 'animations' | 'font' | 'effects' | 'speed' | 'pitch'

export default function MainView() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('chat')
  const [transitionItemId, setTransitionItemId] = useState<string | null>(null)
  const [speedItemId, setSpeedItemId] = useState<string | null>(null)
  const [pitchItemId, setPitchItemId] = useState<string | null>(null)
  const [localPersistReady, setLocalPersistReady] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const { user, loading } = useAuth()
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

  useEffect(() => {
    if (loading) return
    let cancelled = false
    void (async () => {
      await hydrateLocalProjectIfNeeded(user)
      if (!cancelled) setLocalPersistReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

  useGuestProjectPersistence(!user && localPersistReady)
  useUserProjectPersistence(user && localPersistReady ? user : null)

  useEffect(() => {
    if (user) setAuthModalOpen(false)
  }, [user])

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

  const onCloseTransitions = useCallback(() => {
    setRightPanel((prev) => {
      if (prev === 'transitions') return 'chat'
      return prev
    })
    setTransitionItemId(null)
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

  if (loading) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  const showChatPanel = rightPanel === 'chat'

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
          <AccountPanel />
        </div>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.rightSection}>
          {user ? (
            <div className={styles.rightPanelStack}>
              <div className={`${styles.persistentChatPanel} ${showChatPanel ? '' : styles.hiddenPanel}`}>
                <ChatWindow />
              </div>
              {!showChatPanel && <div className={styles.overlayPanel}>{renderActivePanel()}</div>}
            </div>
          ) : (
            <ChatDisabledPlaceholder onOpenAuth={() => setAuthModalOpen(true)} />
          )}
        </div>
      </div>
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      <div className={styles.timelineContainer}>
        <Timeline
          onOpenTransitions={onOpenTransitions}
          onCloseTransitions={onCloseTransitions}
          onOpenAnimations={onOpenAnimations}
          onOpenFont={onOpenFont}
          onOpenEffects={onOpenEffects}
          onOpenSpeed={onOpenSpeed}
          onOpenPitch={onOpenPitch}
        />
      </div>
    </div>
  )
}
