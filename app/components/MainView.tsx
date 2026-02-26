'use client'

import ChatWindow from './ChatWindow'
import Timeline from './Timeline'
import PreviewArea from './PreviewArea'
import styles from './MainView.module.css'

export default function MainView() {
  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        <div className={styles.previewContainer}>
          <PreviewArea />
        </div>
        <div className={styles.timelineContainer}>
          <Timeline />
        </div>
      </div>
      <div className={styles.rightSection}>
        <ChatWindow />
      </div>
    </div>
  )
}
