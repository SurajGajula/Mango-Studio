'use client'

import OnboardingTour from '@/app/components/onboarding/OnboardingTour'
import styles from './OnboardingPreview.module.css'

export default function OnboardingPreviewPage() {
  return (
    <div className={styles.page}>
      <div className={styles.editorShell}>
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.email}>demo@mango.studio</span>
            <span className={styles.badge}>Free</span>
          </div>
          <div className={styles.mediaHeader}>
            <span>Media</span>
            <button type="button" className={styles.uploadButton} data-onboarding="upload">
              Upload
            </button>
          </div>
          <div className={styles.libraryPlaceholder}>
            <p>Your uploaded clips appear here.</p>
            <p className={styles.hint}>Drag an item onto the timeline below.</p>
          </div>
        </aside>

        <main className={styles.previewPanel}>
          <div className={styles.previewFrame}>
            <span>Preview</span>
          </div>
        </main>

        <aside className={styles.chatPanel}>
          <div className={styles.chatHeader}>AI Assistant</div>
          <div className={styles.chatBody}>Ask Mango to help edit your video.</div>
        </aside>
      </div>

      <section className={styles.timelineSection} data-onboarding="timeline">
        <div className={styles.playbackBar}>
          <button type="button" className={styles.playButton}>
            ▶
          </button>
          <span className={styles.timecode}>0:00 / 0:00</span>
          <button type="button" className={styles.toolbarButton}>
            Upload
          </button>
          <button type="button" className={styles.exportButton} data-onboarding="export">
            Export
          </button>
        </div>
        <div className={styles.timelineTracks}>
          <div className={styles.emptyTrack}>Drop media here to start editing</div>
        </div>
      </section>

      <OnboardingTour onComplete={() => undefined} />
    </div>
  )
}
