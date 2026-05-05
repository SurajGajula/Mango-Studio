'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import styles from './CenteredModal.module.css'

export type CenteredModalSize = 'compact' | 'folder' | 'wide'

type Props = {
  onClose: () => void
  backdropCloseDisabled?: boolean
  size?: CenteredModalSize
  overlayStyle?: CSSProperties
  children: ReactNode
}

const sizeClass: Record<CenteredModalSize, string> = {
  compact: styles.contentCompact,
  folder: styles.contentFolder,
  wide: styles.contentWide,
}

export function CenteredModal({
  onClose,
  backdropCloseDisabled = false,
  size = 'compact',
  overlayStyle,
  children,
}: Props) {
  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (backdropCloseDisabled) return
    onClose()
  }

  return (
    <div className={styles.overlay} style={overlayStyle} onClick={handleBackdrop} role="presentation">
      <div className={`${styles.content} ${sizeClass[size]}`}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => !backdropCloseDisabled && onClose()}
          disabled={backdropCloseDisabled}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  )
}
