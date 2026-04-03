'use client'

import styles from './ChatDisabledPlaceholder.module.css'

export default function ChatDisabledPlaceholder() {
  return (
    <div className={styles.container}>
      <div className={styles.body}>
        <p className={styles.title}>AI chat</p>
        <p className={styles.message}>Sign in from the account panel to use AI-assisted editing.</p>
      </div>
    </div>
  )
}
