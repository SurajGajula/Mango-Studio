'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountMediaFolder } from '@/app/lib/accountMediaTypes'
import { buildFolderRows, collectDescendantFolderIds } from '@/app/lib/accountMediaFolderTree'
import { CenteredModal } from '@/app/components/ui/CenteredModal'
import styles from './MoveMediaModal.module.css'

type MoveMediaModalProps = {
  itemName: string
  itemType: 'asset' | 'folder' | 'mixed'
  itemCount?: number
  currentParentId: string | null
  movingFolderId?: string
  movingFolderIds?: string[]
  onClose: () => void
  onMove: (parentId: string | null) => Promise<void>
}

export default function MoveMediaModal({
  itemName,
  itemType,
  itemCount = 1,
  currentParentId,
  movingFolderId,
  movingFolderIds,
  onClose,
  onMove,
}: MoveMediaModalProps) {
  const [folders, setFolders] = useState<AccountMediaFolder[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<'root' | string>('root')

  const foldersBeingMoved = useMemo(() => {
    const ids = [...(movingFolderIds ?? [])]
    if (movingFolderId) ids.push(movingFolderId)
    return [...new Set(ids)]
  }, [movingFolderId, movingFolderIds])

  const excluded = useMemo(() => {
    const next = new Set<string>()
    for (const id of foldersBeingMoved) {
      next.add(id)
      for (const descendantId of collectDescendantFolderIds(folders, id)) {
        next.add(descendantId)
      }
    }
    return next
  }, [folders, foldersBeingMoved])
  const rows = useMemo(() => buildFolderRows(folders).filter((row) => !excluded.has(row.id)), [folders, excluded])

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
    if (itemCount <= 1 && (target === currentParentId || (target === null && currentParentId === null))) {
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

  const showCurrent = itemCount <= 1
  const isCurrent = (folderId: string | null) =>
    showCurrent && ((folderId === null && currentParentId === null) || folderId === currentParentId)

  const title =
    itemCount > 1
      ? 'Move items'
      : itemType === 'folder'
        ? 'Move folder'
        : 'Move media'

  return (
    <CenteredModal onClose={onClose} backdropCloseDisabled={pending} size="folder">
      <div className={styles.header}>
        <h2>{title}</h2>
        <p>
          {itemCount > 1 ? (
            <>
              Choose a folder for <strong>{itemCount} items</strong>
            </>
          ) : (
            <>
              Choose a folder for <strong>{itemName}</strong>
            </>
          )}
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
            disabled={pending || excluded.has(row.id)}
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
    </CenteredModal>
  )
}
