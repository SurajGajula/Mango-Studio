'use client'

import { useState } from 'react'
import { CenteredModal } from '@/app/components/ui/CenteredModal'
import styles from './DeleteProjectModal.module.css'

type DeleteConfirmModalProps = {
  title: string
  itemName: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function DeleteConfirmModal({ title, itemName, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setError(null)
    setPending(true)
    try {
      await onConfirm()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setPending(false)
    }
  }

  return (
    <CenteredModal onClose={() => !pending && onClose()} backdropCloseDisabled={pending} size="compact">
      <div className={styles.header}>
        <h2>{title}</h2>
      </div>
      <p className={styles.body}>
        Permanently delete <span className={styles.projectName}>{itemName}</span>? This cannot be undone.
      </p>
      {error ? <p className={styles.errorText}>{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={() => !pending && onClose()} disabled={pending}>
          Cancel
        </button>
        <button type="button" className={styles.deleteButton} onClick={() => void handleDelete()} disabled={pending}>
          {pending ? '…' : 'Delete'}
        </button>
      </div>
    </CenteredModal>
  )
}
