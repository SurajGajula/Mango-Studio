'use client'

import type { ReactNode } from 'react'
import styles from './SidePanelLayout.module.css'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

export function SidePanelLayout({ title, onClose, children }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
