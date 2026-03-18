'use client'

import { useState } from 'react'
import ChatWindow from './ChatWindow'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './panels/TransitionsPanel'
import FontPanel from './panels/FontPanel'
import EffectsPanel from './panels/EffectsPanel'
import AuthModal from './modals/AuthModal'
import { useAuth } from './AuthProvider'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './MainView.module.css'

type RightPanel = 'chat' | 'transitions' | 'animations' | 'font' | 'effects'

export default function MainView() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('chat')
  const [transitionItemId, setTransitionItemId] = useState<string | null>(null)
  const { user, loading } = useAuth()
  const aspectRatio = useManifestStore((s) => s.aspectRatio)

  const timelineHeight = 'max(212px, calc(100vh - 75vw * 9 / 16))'

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
            onOpenTransitions={(id) => {
              setRightPanel('transitions')
              setTransitionItemId(id)
            }}
            onCloseTransitions={() => {
              if (rightPanel === 'transitions') {
                setRightPanel('chat')
                setTransitionItemId(null)
              }
            }}
            onOpenAnimations={() => setRightPanel('animations')}
            onOpenFont={() => setRightPanel('font')}
            onOpenEffects={() => setRightPanel('effects')}
          />
        </div>
      </div>
      <div className={!user ? styles.blurredContent : styles.rightSection}>
        {rightPanel === 'transitions'
          ? <TransitionsPanel mode="transition" itemId={transitionItemId || undefined} onClose={() => setRightPanel('chat')} />
          : rightPanel === 'animations'
          ? <TransitionsPanel mode="animation" onClose={() => setRightPanel('chat')} />
          : rightPanel === 'font'
          ? <FontPanel onClose={() => setRightPanel('chat')} />
          : rightPanel === 'effects'
          ? <EffectsPanel onClose={() => setRightPanel('chat')} />
          : <ChatWindow />}
      </div>
      {!user && <AuthModal />}
    </div>
  )
}
