'use client'

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useAccountMediaLibrary } from '@/app/hooks/useAccountMediaLibrary'
import type { AccountMediaAsset } from '@/app/lib/accountMediaTypes'
import styles from './ReplaceFromLibraryModal.module.css'

export type ReplaceLibraryVisualAsset = {
  id: string
  name: string
  kind: 'image' | 'video'
  mimeType: string
}

export type ReplaceLibraryAudioAsset = {
  id: string
  name: string
  kind: 'audio'
  mimeType: string
}

export type ReplaceLibraryAsset = ReplaceLibraryVisualAsset | ReplaceLibraryAudioAsset

type ReplaceFromLibraryModalProps = {
  open: boolean
  onClose: () => void
  mediaFilter: 'visual' | 'audio' | 'all'
  title?: string
  description?: string
  multiSelect?: boolean
  confirmLabel?: string
  onPick?: (asset: ReplaceLibraryAsset) => void | Promise<void>
  onPickMany?: (assets: ReplaceLibraryAsset[]) => void | Promise<void>
}

function toLibraryAsset(asset: AccountMediaAsset): ReplaceLibraryAsset {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
  } as ReplaceLibraryAsset
}

export default function ReplaceFromLibraryModal({
  open,
  onClose,
  mediaFilter,
  title,
  description,
  multiSelect = false,
  confirmLabel,
  onPick,
  onPickMany,
}: ReplaceFromLibraryModalProps) {
  const enabled = open
  const {
    folders,
    assets,
    setCurrentFolderId,
    search,
    setSearch,
    loading,
    error,
  } = useAccountMediaLibrary(enabled)

  const [folderTrail, setFolderTrail] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Root' }])
  const [pickingId, setPickingId] = useState<string | null>(null)
  const [selectedAssets, setSelectedAssets] = useState<ReplaceLibraryAsset[]>([])
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedAssets([])
    setPickingId(null)
    setConfirming(false)
    setFolderTrail([{ id: null, name: 'Root' }])
    setCurrentFolderId(null)
  }, [open, setSearch, setCurrentFolderId])

  const filteredAssets = useMemo(() => {
    if (mediaFilter === 'audio') return assets.filter((a) => a.kind === 'audio')
    if (mediaFilter === 'visual') return assets.filter((a) => a.kind === 'image' || a.kind === 'video')
    return assets.filter((a) => a.kind === 'image' || a.kind === 'video' || a.kind === 'audio')
  }, [assets, mediaFilter])

  const selectedIdSet = useMemo(() => new Set(selectedAssets.map((asset) => asset.id)), [selectedAssets])

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

  const assetMatchesFilter = useCallback(
    (asset: AccountMediaAsset) => {
      if (mediaFilter === 'audio') return asset.kind === 'audio'
      if (mediaFilter === 'visual') return asset.kind === 'image' || asset.kind === 'video'
      return asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio'
    },
    [mediaFilter]
  )

  const handlePickAsset = useCallback(
    async (asset: AccountMediaAsset) => {
      if (!assetMatchesFilter(asset)) return

      if (multiSelect) {
        const next = toLibraryAsset(asset)
        setSelectedAssets((prev) => {
          if (prev.some((entry) => entry.id === asset.id)) {
            return prev.filter((entry) => entry.id !== asset.id)
          }
          return [...prev, next]
        })
        return
      }

      setPickingId(asset.id)
      try {
        await onPick?.(toLibraryAsset(asset))
        onClose()
      } catch (err) {
        console.error(err)
      } finally {
        setPickingId(null)
      }
    },
    [assetMatchesFilter, multiSelect, onPick, onClose]
  )

  const handleConfirmMulti = useCallback(async () => {
    if (!multiSelect || selectedAssets.length === 0 || !onPickMany) return
    setConfirming(true)
    try {
      await onPickMany(selectedAssets)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setConfirming(false)
    }
  }, [multiSelect, selectedAssets, onPickMany, onClose])

  if (!open) return null

  const heading = title ?? 'Replace from library'
  const subtitle =
    description ??
    (mediaFilter === 'audio'
      ? 'Choose an audio file from your account media.'
      : mediaFilter === 'all'
        ? 'Choose files from your account media.'
        : 'Choose an image or video from your account media.')
  const emptyFilterMessage =
    mediaFilter === 'audio'
      ? 'No audio files here. Try another folder or search.'
      : mediaFilter === 'all'
        ? 'No media files here. Try another folder or search.'
        : 'No images or videos here. Try another folder or search.'
  const actionLabel = confirmLabel ?? (multiSelect ? 'Attach' : 'Select')

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className={styles.modal} role="dialog" aria-labelledby="replace-library-title" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h2 id="replace-library-title">{heading}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
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
          <div
            className={styles.list}
            onWheelCapture={(event) => {
              event.stopPropagation()
            }}
          >
            {loading ? <p className={styles.statusText}>Loading…</p> : null}
            {error ? <p className={styles.errorText}>{error}</p> : null}
            {!loading && !error && folders.length === 0 && assets.length === 0 ? (
              <p className={styles.statusText}>No media in this folder.</p>
            ) : null}
            {!loading && !error && (folders.length > 0 || assets.length > 0) && filteredAssets.length === 0 ? (
              <p className={styles.statusText}>{emptyFilterMessage}</p>
            ) : null}
            {folders.map((folder) => (
              <div key={folder.id} className={styles.row}>
                <button type="button" className={styles.folderPrimary} onClick={(e) => handleOpenFolderRow(e, folder.id, folder.name)}>
                  {folder.name}
                </button>
              </div>
            ))}
            {filteredAssets.map((asset) => {
              const selected = selectedIdSet.has(asset.id)
              return (
                <div key={asset.id} className={`${styles.row} ${selected ? styles.rowSelected : ''}`}>
                  <button
                    type="button"
                    className={styles.assetButton}
                    disabled={pickingId !== null || confirming}
                    onClick={() => void handlePickAsset(asset)}
                  >
                    <span className={styles.kindBadge}>{asset.kind}</span>
                    <span>{pickingId === asset.id ? '…' : asset.name}</span>
                  </button>
                </div>
              )
            })}
          </div>
          {multiSelect ? (
            <div className={styles.footer}>
              <button type="button" className={styles.cancelButton} onClick={onClose} disabled={confirming}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                disabled={confirming || selectedAssets.length === 0}
                onClick={() => void handleConfirmMulti()}
              >
                {confirming ? '…' : `${actionLabel}${selectedAssets.length > 0 ? ` (${selectedAssets.length})` : ''}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
