'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountMediaFolder } from '@/app/lib/accountMediaTypes'
import styles from './MoveMediaModal.module.css'

function buildFolderRows(folders: AccountMediaFolder[]): { id: string; name: string; depth: number }[] {
  const byParent = new Map<string | null, AccountMediaFolder[]>()
  for (const f of folders) {
    const pid = f.parent_id ?? null
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(f)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  const out: { id: string; name: string; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const c of children) {
      out.push({ id: c.id, name: c.name, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

type MoveMediaModalProps = {
  assetName: string
  currentFolderId: string | null
  onClose: () => void
  onMove: (folderId: string | null) => Promise<void>
}

export default function MoveMediaModal({ assetName, currentFolderId, onClose, onMove }: MoveMediaModalProps) {
  const [folders, setFolders] = useState<AccountMediaFolder[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<'root' | string>('root')

  const rows = useMemo(() => buildFolderRows(folders), [folders])

  const loadFolders = useCallback(async () => {
    setLoadError(null)
    const response = await fetch('/api/media/folders?all=1')
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setLoadError(body?.error ?? 'Failed to load folders')
      return
    }
    const json = await response.json()
    setFolders(json.folders ?? [])
  }, [])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  const handleConfirm = async () => {
    const target = selectedId === 'root' ? null : selectedId
    if (target === currentFolderId || (target === null && currentFolderId === null)) {
      onClose()
      return
    }
    setMoveError(null)
    setPending(true)
    try {
      await onMove(target)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Move failed.'
      setMoveError(msg)
    } finally {
      setPending(false)
    }
  }

  const isCurrent = (folderId: string | null) =>
    (folderId === null && currentFolderId === null) || folderId === currentFolderId

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && !pending && onClose()}>
      <div className={styles.modalContent}>
        <button type="button" className={styles.closeButton} onClick={() => !pending && onClose()} aria-label="Close">
          ×
        </button>
        <div className={styles.header}>
          <h2>Move media</h2>
          <p>
            Choose a folder for <strong>{assetName}</strong>
          </p>
        </div>
        {loadError ? <p className={styles.errorText}>{loadError}</p> : null}
        <div className={styles.list} role="listbox" aria-label="Folders">
          <button
            type="button"
            className={`${styles.folderOption} ${selectedId === 'root' ? styles.folderOptionSelected : ''} ${isCurrent(null) ? styles.folderOptionCurrent : ''}`}
            style={{ paddingLeft: '0.75rem' }}
            onClick={() => setSelectedId('root')}
            disabled={pending}
          >
            Root
            {isCurrent(null) ? <span className={styles.badge}>Current</span> : null}
          </button>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`${styles.folderOption} ${selectedId === row.id ? styles.folderOptionSelected : ''} ${isCurrent(row.id) ? styles.folderOptionCurrent : ''}`}
              style={{ paddingLeft: `${0.75 + row.depth * 0.75}rem` }}
              onClick={() => setSelectedId(row.id)}
              disabled={pending}
            >
              {row.name}
              {isCurrent(row.id) ? <span className={styles.badge}>Current</span> : null}
            </button>
          ))}
        </div>
        {moveError ? <p className={styles.errorText}>{moveError}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={() => !pending && onClose()} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleConfirm()}
            disabled={pending || loadError !== null}
          >
            {pending ? '…' : 'Move here'}
          </button>
        </div>
      </div>
    </div>
  )
}
