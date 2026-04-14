'use client'

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useAuth } from '@/app/components/AuthProvider'
import { useAccountMediaLibrary } from '@/app/hooks/useAccountMediaLibrary'
import type { AccountMediaAsset } from '@/app/lib/accountMediaTypes'
import styles from './ReplaceFromLibraryModal.module.css'

export type ReplaceLibraryVisualAsset = {
  id: string
  name: string
  kind: 'image' | 'video'
}

type ReplaceFromLibraryModalProps = {
  open: boolean
  onClose: () => void
  onPick: (asset: ReplaceLibraryVisualAsset) => void | Promise<void>
}

export default function ReplaceFromLibraryModal({ open, onClose, onPick }: ReplaceFromLibraryModalProps) {
  const { user } = useAuth()
  const enabled = Boolean(open && user)
  const {
    folders,
    assets,
    currentFolderId,
    setCurrentFolderId,
    search,
    setSearch,
    loading,
    error,
  } = useAccountMediaLibrary(enabled)

  const [folderTrail, setFolderTrail] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Root' }])
  const [pickingId, setPickingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFolderTrail([{ id: null, name: 'Root' }])
    setCurrentFolderId(null)
    setSearch('')
  }, [open, setCurrentFolderId, setSearch])

  const visualAssets = useMemo(() => assets.filter((a) => a.kind === 'image' || a.kind === 'video'), [assets])

  const handleOpenFolder = useCallback(
    (folderId: string, name: string) => {
      setCurrentFolderId(folderId)
      setFolderTrail((prev) => [...prev, { id: folderId, name }])
    },
    [setCurrentFolderId]
  )

  const handleGoToTrail = useCallback(
    (index: number) => {
      const nextTrail = folderTrail.slice(0, index + 1)
      setFolderTrail(nextTrail)
      setCurrentFolderId(nextTrail[nextTrail.length - 1]?.id ?? null)
    },
    [folderTrail, setCurrentFolderId]
  )

  const handleOpenFolderRow = useCallback(
    (e: MouseEvent, folderId: string, name: string) => {
      e.preventDefault()
      handleOpenFolder(folderId, name)
    },
    [handleOpenFolder]
  )

  const handlePickAsset = useCallback(
    async (asset: AccountMediaAsset) => {
      if (asset.kind !== 'image' && asset.kind !== 'video') return
      setPickingId(asset.id)
      try {
        await onPick({ id: asset.id, kind: asset.kind, name: asset.name })
        onClose()
      } catch (err) {
        console.error(err)
      } finally {
        setPickingId(null)
      }
    },
    [onPick, onClose]
  )

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className={styles.modal} role="dialog" aria-labelledby="replace-library-title" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h2 id="replace-library-title">Replace from library</h2>
            <p>Choose an image or video from your account media.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {!user ? (
            <p className={styles.signInHint}>Sign in to browse saved media in the account panel.</p>
          ) : (
            <>
              <input
                className={styles.searchInput}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name"
              />
              <div className={styles.folderTrail}>
                {folderTrail.map((entry, index) => (
                  <button
                    type="button"
                    key={`${entry.id ?? 'root'}-${index}`}
                    className={styles.trailButton}
                    onClick={() => handleGoToTrail(index)}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
              <div className={styles.list}>
                {loading ? <p className={styles.statusText}>Loading…</p> : null}
                {error ? <p className={styles.errorText}>{error}</p> : null}
                {!loading && !error && folders.length === 0 && assets.length === 0 ? (
                  <p className={styles.statusText}>No media in this folder.</p>
                ) : null}
                {!loading && !error && (folders.length > 0 || assets.length > 0) && visualAssets.length === 0 ? (
                  <p className={styles.statusText}>No images or videos here. Try another folder or search.</p>
                ) : null}
                {folders.map((folder) => (
                  <div key={folder.id} className={styles.row}>
                    <button type="button" className={styles.folderPrimary} onClick={(e) => handleOpenFolderRow(e, folder.id, folder.name)}>
                      {folder.name}
                    </button>
                  </div>
                ))}
                {visualAssets.map((asset) => (
                  <div key={asset.id} className={styles.row}>
                    <button
                      type="button"
                      className={styles.assetButton}
                      disabled={pickingId !== null}
                      onClick={() => void handlePickAsset(asset)}
                    >
                      <span className={styles.kindBadge}>{asset.kind}</span>
                      <span>{pickingId === asset.id ? '…' : asset.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
