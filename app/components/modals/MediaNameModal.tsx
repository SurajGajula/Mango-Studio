'use client'

import { FormEvent, useEffect, useState } from 'react'
import { CenteredModal } from '@/app/components/ui/CenteredModal'
import styles from './MediaNameModal.module.css'

type MediaNameModalProps = {
  title: string
  description?: string
  initialValue: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (value: string) => Promise<void>
}

export default function MediaNameModal({
  title,
  description,
  initialValue,
  confirmLabel = 'Save',
  onClose,
  onConfirm,
}: MediaNameModalProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    setError(null)
    setPending(true)
    try {
      await onConfirm(trimmed)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
    } finally {
      setPending(false)
    }
  }

  return (
    <CenteredModal onClose={onClose} backdropCloseDisabled={pending} size="compact">
      <div className={styles.header}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="media-name-input">Name</label>
          <input
            id="media-name-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            disabled={pending}
            autoComplete="off"
          />
        </div>
        {error ? <p className={styles.errorText}>{error}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={() => !pending && onClose()} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={pending}>
            {pending ? '…' : confirmLabel}
          </button>
        </div>
      </form>
    </CenteredModal>
  )
}
