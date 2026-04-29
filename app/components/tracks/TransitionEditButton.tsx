'use client'

import styles from './Timeline.module.css'

interface TransitionEditButtonProps {
  leftPercent: number
  hasTransition: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export default function TransitionEditButton({ leftPercent, hasTransition, onClick }: TransitionEditButtonProps) {
  return (
    <button
      className={styles.transitionButton}
      style={{ left: `${leftPercent}%` }}
      onClick={onClick}
      title="Edit Transition"
    >
      {!hasTransition ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      )}
    </button>
  )
}
