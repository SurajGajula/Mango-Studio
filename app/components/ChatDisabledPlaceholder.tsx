'use client'

import styles from './ChatDisabledPlaceholder.module.css'

interface ChatDisabledPlaceholderProps {
  onOpenAuth: () => void
}

export default function ChatDisabledPlaceholder({ onOpenAuth }: ChatDisabledPlaceholderProps) {
  return (
    <div className={styles.container}>
      <div className={styles.body}>
        <p className={styles.title}>AI chat</p>
        <p className={styles.message}>Sign in to use AI-assisted editing, sync your work, and manage billing.</p>
        <button type="button" className={styles.authButton} onClick={onOpenAuth}>
          Sign up / Log in
        </button>
      </div>
    </div>
  )
}
