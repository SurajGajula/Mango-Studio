'use client'

import { useState } from 'react'
import ChatWindow from './ChatWindow'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './TransitionsPanel'
import FontPanel from './FontPanel'
import EffectsPanel from './EffectsPanel'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './MainView.module.css'

type RightPanel = 'chat' | 'transitions' | 'font' | 'effects'

export default function MainView() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('chat')
  const aspectRatio = useManifestStore((s) => s.aspectRatio)

  const timelineHeight = 'max(212px, calc(100vh - 75vw * 9 / 16))'

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.timelineContainer} style={{ height: timelineHeight }}>
          <Timeline
            onOpenTransitions={() => setRightPanel('transitions')}
            onOpenFont={() => setRightPanel('font')}
            onOpenEffects={() => setRightPanel('effects')}
          />
        </div>
      </div>
      <div className={styles.rightSection}>
        {rightPanel === 'transitions'
          ? <TransitionsPanel onClose={() => setRightPanel('chat')} />
          : rightPanel === 'font'
          ? <FontPanel onClose={() => setRightPanel('chat')} />
          : rightPanel === 'effects'
          ? <EffectsPanel onClose={() => setRightPanel('chat')} />
          : <ChatWindow />}
      </div>
    </div>
  )
}
