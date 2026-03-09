'use client'

import { useState } from 'react'
import ChatWindow from './ChatWindow'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import TransitionsPanel from './TransitionsPanel'
import { useManifestStore } from '@/app/stores/manifestStore'
import styles from './MainView.module.css'

export default function MainView() {
  const [showTransitions, setShowTransitions] = useState(false)
  const aspectRatio = useManifestStore((s) => s.aspectRatio)

  const timelineHeight = 'max(212px, calc(100vh - 75vw * 9 / 16))'

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.timelineContainer} style={{ height: timelineHeight }}>
          <Timeline onOpenTransitions={() => setShowTransitions(true)} />
        </div>
      </div>
      <div className={styles.rightSection}>
        {showTransitions
          ? <TransitionsPanel onClose={() => setShowTransitions(false)} />
          : <ChatWindow />}
      </div>
    </div>
  )
}
