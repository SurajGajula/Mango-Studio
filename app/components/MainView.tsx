'use client'

import { useState, useCallback, useEffect } from 'react'
import ChatWindow from './ChatWindow'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './panels/TransitionsPanel'
import FontPanel from './panels/FontPanel'
import EffectsPanel from './panels/EffectsPanel'
import SpeedPanel from './panels/SpeedPanel'
import AuthModal from './modals/AuthModal'
import { useAuth } from './AuthProvider'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import styles from './MainView.module.css'

type RightPanel = 'chat' | 'transitions' | 'animations' | 'font' | 'effects' | 'speed'

export default function MainView() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('chat')
  const [transitionItemId, setTransitionItemId] = useState<string | null>(null)
  const [speedItemId, setSpeedItemId] = useState<string | null>(null)
  const { user, loading } = useAuth()
  const aspectRatio = useManifestStore((s) => s.aspectRatio)
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

  const timelineHeight = 'max(212px, calc(100vh - 75vw * 9 / 16))'

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
        // Only sync selection to panel if we don't have a transitionItemId yet
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
  }, [selectedVideoId, selectedImageId, selectedTextId, selectedAudioId, rightPanel, speedItemId, transitionItemId])

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
      const isVideo = videos.some(v => v.id === id)
      if (isVideo) selectVideo(id)
      else {
        const isImage = images.some(i => i.id === id)
        if (isImage) selectImage(id)
      }
    }
  }, [videos, images, selectVideo, selectImage])

  const onOpenFont = useCallback(() => setRightPanel('font'), [])
  const onOpenEffects = useCallback(() => setRightPanel('effects'), [])
  const onOpenSpeed = useCallback((id: string) => {
    setRightPanel('speed')
    setSpeedItemId(id)
    const isVideo = videos.some(v => v.id === id)
    if (isVideo) selectVideo(id)
    else {
      const isAudio = audios.some(a => a.id === id)
      if (isAudio) selectAudio(id)
    }
  }, [videos, audios, selectVideo, selectAudio])

  if (loading) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={!user ? styles.blurredContent : styles.leftSection}>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.timelineContainer} style={{ height: timelineHeight }}>
          <Timeline
            onOpenTransitions={onOpenTransitions}
            onCloseTransitions={onCloseTransitions}
            onOpenAnimations={onOpenAnimations}
            onOpenFont={onOpenFont}
            onOpenEffects={onOpenEffects}
            onOpenSpeed={onOpenSpeed}
          />
        </div>
      </div>
      <div className={!user ? styles.blurredContent : styles.rightSection}>
        {rightPanel === 'transitions'
          ? <TransitionsPanel key={`transition-${transitionItemId}`} mode="transition" itemId={transitionItemId || undefined} onClose={() => setRightPanel('chat')} />
          : rightPanel === 'animations'
          ? <TransitionsPanel key={`animation-${transitionItemId || selectedImageId || selectedVideoId}`} mode="animation" itemId={transitionItemId || undefined} onClose={() => setRightPanel('chat')} />
          : rightPanel === 'font'
          ? <FontPanel onClose={() => setRightPanel('chat')} />
          : rightPanel === 'effects'
          ? <EffectsPanel onClose={() => setRightPanel('chat')} />
          : rightPanel === 'speed'
          ? <SpeedPanel key={`speed-${speedItemId}`} itemId={speedItemId || ''} onClose={() => setRightPanel('chat')} />
          : <ChatWindow />}
      </div>
      {!user && <AuthModal />}
    </div>
  )
}
