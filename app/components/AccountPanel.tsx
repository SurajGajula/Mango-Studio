'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAuth } from './AuthProvider'
import DeleteConfirmModal from './modals/DeleteProjectModal'
import MediaNameModal from './modals/MediaNameModal'
import MoveMediaModal from './modals/MoveMediaModal'
import PaymentModal from './modals/PaymentModal'
import ProjectSelectModal from './modals/ProjectSelectModal'
import SolidColorPresetStrip from './ui/SolidColorPresetStrip'
import { addSolidShapePresetAtPlayhead } from '@/app/lib/addImageAtPlayhead'
import { parseAccountMediaDragData, setAccountMediaDragData } from '@/app/lib/accountMediaDrag'
import { uploadAccountMedia } from '@/app/lib/accountMediaUploadClient'
import { useAccountMediaLibrary } from '@/app/hooks/useAccountMediaLibrary'
import { UserProject } from '@/app/lib/projectTypes'
import styles from './AccountPanel.module.css'

type NameModalState =
  | { type: 'new-project' }
  | { type: 'rename-project'; initialValue: string }
  | { type: 'new-folder' }
  | { type: 'new-folder-and-move' }
  | { type: 'rename-folder'; folderId: string; initialValue: string }
  | { type: 'rename-asset'; assetId: string; initialValue: string }

type DeleteModalState =
  | { type: 'project' }
  | { type: 'folder'; folderId: string; name: string }
  | { type: 'asset'; assetId: string; name: string }
  | { type: 'selection'; assetIds: string[]; folderIds: string[]; name: string }

type MoveModalState =
  | { type: 'asset'; assetId: string; name: string; folderId: string | null }
  | { type: 'folder'; folderId: string; name: string; parentId: string | null }
  | {
      type: 'selection'
      assetIds: string[]
      folderIds: string[]
      name: string
      itemCount: number
    }

type LibrarySelectionItem = { type: 'asset' | 'folder'; id: string }

type LibraryContextMenuState = { x: number; y: number }

type AccountPanelProps = {
  projects: UserProject[]
  activeProjectId: string | null
  onSelectProject: (projectId: string | null) => void
  onReplayOnboarding?: () => void
}

export default function AccountPanel({ projects, activeProjectId, onSelectProject, onReplayOnboarding }: AccountPanelProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [folderTrail, setFolderTrail] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Root' }])
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const libraryContextMenuRef = useRef<HTMLDivElement>(null)
  const [nameModal, setNameModal] = useState<NameModalState | null>(null)
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null)
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<'root' | string | null>(null)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null)
  const [selectedItems, setSelectedItems] = useState<LibrarySelectionItem[]>([])
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null)
  const [libraryContextMenu, setLibraryContextMenu] = useState<LibraryContextMenuState | null>(null)

  const { user, supabase, profile } = useAuth()
  const {
    folders,
    assets,
    currentFolderId,
    setCurrentFolderId,
    search,
    setSearch,
    loading,
    error,
    createFolder,
    renameFolder,
    renameAsset,
    deleteFolder,
    deleteAsset,
    moveAsset,
    moveAssets,
    moveFolder,
    moveFolders,
  } = useAccountMediaLibrary(true)

  const libraryItems = useMemo((): LibrarySelectionItem[] => {
    return [
      ...folders.map((folder) => ({ type: 'folder' as const, id: folder.id })),
      ...assets.map((asset) => ({ type: 'asset' as const, id: asset.id })),
    ]
  }, [folders, assets])

  const selectedKeySet = useMemo(
    () => new Set(selectedItems.map((item) => `${item.type}:${item.id}`)),
    [selectedItems]
  )

  const selectedAssetIds = useMemo(
    () => selectedItems.filter((item) => item.type === 'asset').map((item) => item.id),
    [selectedItems]
  )
  const selectedFolderIds = useMemo(
    () => selectedItems.filter((item) => item.type === 'folder').map((item) => item.id),
    [selectedItems]
  )

  const clearLibrarySelection = useCallback(() => {
    setSelectedItems([])
    setSelectionAnchorIndex(null)
    setLibraryContextMenu(null)
  }, [])

  useEffect(() => {
    clearLibrarySelection()
  }, [currentFolderId, search, clearLibrarySelection])

  useEffect(() => {
    if (!libraryContextMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (libraryContextMenuRef.current?.contains(event.target as Node)) return
      setLibraryContextMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLibraryContextMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [libraryContextMenu])

  const endDragVisuals = useCallback(() => {
    setDraggingAssetId(null)
    setDragOverTarget(null)
  }, [])

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/customer-portal', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (err) {
      console.error('Portal error:', err)
      alert('Failed to open subscription management.')
    }
  }

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }

  const performDeleteProject = async () => {
    if (!activeProjectId) throw new Error('No project selected')
    const response = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error ?? 'Failed to delete project')
    }
    const nextId = body?.projects?.[0]?.id ?? null
    onSelectProject(nextId)
    window.dispatchEvent(new Event('projects-updated'))
  }

  const performDeleteFolder = async (folderId: string) => {
    await deleteFolder(folderId)
    if (currentFolderId === folderId) {
      setCurrentFolderId(null)
      setFolderTrail([{ id: null, name: 'Root' }])
    }
  }

  const handleAccountUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
        continue
      }

      let durationSeconds: number | undefined
      if (file.type.startsWith('video/')) {
        const blobUrl = URL.createObjectURL(file)
        const videoElement = document.createElement('video')
        videoElement.src = blobUrl
        await new Promise<void>((resolve, reject) => {
          videoElement.onloadedmetadata = () => resolve()
          videoElement.onerror = () => reject(new Error('Unable to read video metadata'))
        })
        durationSeconds = Number(videoElement.duration) || 0
        URL.revokeObjectURL(blobUrl)
        if (durationSeconds > 600) {
          alert('Video uploads must be under 10 minutes.')
          continue
        }
      }

      if (file.type.startsWith('audio/')) {
        const arrayBuffer = await file.arrayBuffer()
        const audioCtx = new AudioContext()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        await audioCtx.close()
        durationSeconds = audioBuffer.duration
        if (durationSeconds > 600) {
          alert('Audio uploads must be under 10 minutes.')
          continue
        }
      }

      try {
        await uploadAccountMedia({
          file,
          folderId: currentFolderId,
          durationSeconds,
        })
        window.dispatchEvent(new Event('account-media-updated'))
      } catch (error: unknown) {
        alert(error instanceof Error ? error.message : 'Upload failed')
      }
    }

    e.target.value = ''
  }

  const handleOpenFolder = (folderId: string, name: string) => {
    clearLibrarySelection()
    setCurrentFolderId(folderId)
    setFolderTrail((prev) => [...prev, { id: folderId, name }])
  }

  const handleGoToTrail = (index: number) => {
    clearLibrarySelection()
    const nextTrail = folderTrail.slice(0, index + 1)
    setFolderTrail(nextTrail)
    setCurrentFolderId(nextTrail[nextTrail.length - 1]?.id ?? null)
  }

  const resolveAssetIdsToMove = (assetId: string) => {
    if (selectedAssetIds.includes(assetId) && selectedAssetIds.length > 1) {
      return selectedAssetIds
    }
    return [assetId]
  }

  const handleDropOnFolder = async (folderId: string | null, assetId: string) => {
    const ids = resolveAssetIdsToMove(assetId)
    const idsNeedingMove = ids.filter((id) => {
      const asset = assets.find((a) => a.id === id)
      return (asset?.folder_id ?? null) !== folderId
    })
    if (idsNeedingMove.length === 0) return
    try {
      await moveAssets(idsNeedingMove, folderId)
      clearLibrarySelection()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to move item')
    }
  }

  const isLibraryItemSelected = (type: LibrarySelectionItem['type'], id: string) =>
    selectedKeySet.has(`${type}:${id}`)

  const handleLibraryItemClick = (e: MouseEvent, item: LibrarySelectionItem, index: number) => {
    if (draggingAssetId) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    setLibraryContextMenu(null)

    if (e.shiftKey) {
      if (selectionAnchorIndex !== null) {
        const start = Math.min(selectionAnchorIndex, index)
        const end = Math.max(selectionAnchorIndex, index)
        setSelectedItems(libraryItems.slice(start, end + 1))
        return
      }
      setSelectedItems([item])
      setSelectionAnchorIndex(index)
      return
    }

    if (e.metaKey || e.ctrlKey) {
      setSelectedItems((prev) => {
        const exists = prev.some((entry) => entry.type === item.type && entry.id === item.id)
        if (exists) {
          return prev.filter((entry) => !(entry.type === item.type && entry.id === item.id))
        }
        return [...prev, item]
      })
      setSelectionAnchorIndex(index)
      return
    }

    if (item.type === 'folder') {
      const folder = folders.find((entry) => entry.id === item.id)
      if (folder) handleOpenFolder(folder.id, folder.name)
      return
    }

    setSelectedItems([item])
    setSelectionAnchorIndex(index)
  }

  const handleLibraryContextMenu = (e: MouseEvent, item: LibrarySelectionItem, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    const alreadySelected = selectedItems.some((entry) => entry.type === item.type && entry.id === item.id)
    if (!alreadySelected) {
      setSelectedItems([item])
      setSelectionAnchorIndex(index)
    }
    setLibraryContextMenu({ x: e.clientX, y: e.clientY })
  }

  const selectionLabel = useMemo(() => {
    if (selectedItems.length === 0) return ''
    if (selectedItems.length === 1) {
      const only = selectedItems[0]
      if (only.type === 'folder') {
        return folders.find((folder) => folder.id === only.id)?.name ?? '1 item'
      }
      return assets.find((asset) => asset.id === only.id)?.name ?? '1 item'
    }
    return `${selectedItems.length} items`
  }, [selectedItems, folders, assets])

  const openMoveForSelection = () => {
    if (selectedItems.length === 0) return
    setLibraryContextMenu(null)
    if (selectedItems.length === 1 && selectedAssetIds.length === 1) {
      const asset = assets.find((entry) => entry.id === selectedAssetIds[0])
      if (!asset) return
      setMoveModal({
        type: 'asset',
        assetId: asset.id,
        name: asset.name,
        folderId: asset.folder_id,
      })
      return
    }
    if (selectedItems.length === 1 && selectedFolderIds.length === 1) {
      const folder = folders.find((entry) => entry.id === selectedFolderIds[0])
      if (!folder) return
      setMoveModal({
        type: 'folder',
        folderId: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
      })
      return
    }
    setMoveModal({
      type: 'selection',
      assetIds: selectedAssetIds,
      folderIds: selectedFolderIds,
      name: selectionLabel,
      itemCount: selectedItems.length,
    })
  }

  const openNewFolderAndMove = () => {
    if (selectedItems.length === 0) return
    setLibraryContextMenu(null)
    setNameModal({ type: 'new-folder-and-move' })
  }

  const openDeleteForSelection = () => {
    if (selectedItems.length === 0) return
    setLibraryContextMenu(null)
    if (selectedItems.length === 1 && selectedAssetIds.length === 1) {
      const asset = assets.find((entry) => entry.id === selectedAssetIds[0])
      if (!asset) return
      setDeleteModal({ type: 'asset', assetId: asset.id, name: asset.name })
      return
    }
    if (selectedItems.length === 1 && selectedFolderIds.length === 1) {
      const folder = folders.find((entry) => entry.id === selectedFolderIds[0])
      if (!folder) return
      setDeleteModal({ type: 'folder', folderId: folder.id, name: folder.name })
      return
    }
    setDeleteModal({
      type: 'selection',
      assetIds: selectedAssetIds,
      folderIds: selectedFolderIds,
      name: selectionLabel,
    })
  }

  const moveSelectedItems = async (parentId: string | null) => {
    if (selectedAssetIds.length > 0) {
      await moveAssets(selectedAssetIds, parentId)
    }
    if (selectedFolderIds.length > 0) {
      await moveFolders(selectedFolderIds, parentId)
    }
    clearLibrarySelection()
  }

  const performDeleteSelection = async (assetIds: string[], folderIds: string[]) => {
    if (assetIds.length > 0 || folderIds.length > 0) {
      const response = await fetch('/api/media/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds, folderIds }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to delete items')
      }
      if (currentFolderId && folderIds.includes(currentFolderId)) {
        setCurrentFolderId(null)
        setFolderTrail([{ id: null, name: 'Root' }])
      }
      window.dispatchEvent(new Event('account-media-updated'))
    }
    clearLibrarySelection()
  }

  const hasEntries = useMemo(() => folders.length > 0 || assets.length > 0, [folders, assets])
  const activeProjectName = useMemo(
    () => projects.find((project) => project.id === activeProjectId)?.name ?? 'Select project',
    [activeProjectId, projects]
  )

  if (!user) return null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerSignedIn}>
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{user.email}</span>
            {profile?.requests_remaining !== undefined && (
              <span className={styles.requestCount}>{profile.requests_remaining} requests left</span>
            )}
          </div>
          <div className={styles.headerButtons}>
            {profile?.is_pro ? (
              <button type="button" className={styles.manageButton} onClick={handleManageSubscription} title="Manage Subscription">
                Pro
              </button>
            ) : (
              <button type="button" className={styles.proButton} onClick={() => setShowPaymentModal(true)}>
                Pro
              </button>
            )}
            {onReplayOnboarding ? (
              <button
                type="button"
                className={styles.helpButton}
                onClick={onReplayOnboarding}
                title="Replay getting started tour"
              >
                ?
              </button>
            ) : null}
            <button type="button" className={styles.signOutButton} onClick={handleSignOut} title="Sign Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className={styles.mediaSection}>
        <div className={styles.projectsSection}>
          <div className={styles.mediaSectionHeader}>
            <p className={styles.mediaSectionLabel}>Projects</p>
            <div className={styles.mediaActions}>
              <button type="button" className={styles.mediaActionButton} onClick={() => setProjectModalOpen(true)} disabled={projects.length === 0}>
                Open
              </button>
              <button type="button" className={styles.mediaActionButton} onClick={() => setNameModal({ type: 'new-project' })}>
                New
              </button>
              <button
                type="button"
                className={styles.mediaActionButton}
                onClick={() =>
                  setNameModal({
                    type: 'rename-project',
                    initialValue: projects.find((project) => project.id === activeProjectId)?.name ?? '',
                  })
                }
                disabled={!activeProjectId}
              >
                Rename
              </button>
              <button
                type="button"
                className={styles.mediaActionButton}
                onClick={() => setDeleteModal({ type: 'project' })}
                disabled={!activeProjectId || projects.length <= 1}
                title={projects.length === 1 ? 'At least one project must remain' : undefined}
              >
                Delete
              </button>
            </div>
          </div>
          <button type="button" className={styles.projectSelectButton} onClick={() => setProjectModalOpen(true)} disabled={projects.length === 0}>
            {activeProjectName}
          </button>
        </div>
        <div className={styles.mediaSectionHeader}>
          <p className={styles.mediaSectionLabel}>Media</p>
          <div className={styles.mediaActions}>
            <button
              type="button"
              className={styles.mediaActionButton}
              data-onboarding="upload"
              onClick={() => uploadInputRef.current?.click()}
            >
              Upload
            </button>
            <button type="button" className={styles.mediaActionButton} onClick={() => setNameModal({ type: 'new-folder' })}>
              Folder
            </button>
          </div>
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          style={{ display: 'none' }}
          onChange={handleAccountUpload}
        />
        <input
          className={styles.searchInput}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by item name"
        />
        <div className={styles.folderTrail}>
          {folderTrail.map((entry, index) => (
            <button
              type="button"
              key={`${entry.id ?? 'root'}-${index}`}
              className={`${styles.trailButton} ${draggingAssetId && dragOverTarget === 'root' && index === 0 ? styles.trailDropTarget : ''}`}
              onClick={() => handleGoToTrail(index)}
              onDragOver={(e) => {
                if (!draggingAssetId || index !== 0) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverTarget('root')
              }}
              onDrop={(e) => {
                if (!draggingAssetId || index !== 0) return
                e.preventDefault()
                const id = parseAccountMediaDragData(e.dataTransfer)?.id ?? e.dataTransfer.getData('text/plain')
                if (id) void handleDropOnFolder(null, id)
                endDragVisuals()
              }}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <div
          className={styles.libraryList}
          onClick={() => {
            clearLibrarySelection()
          }}
        >
          {loading ? <p className={styles.statusText}>Loading media...</p> : null}
          {error ? <p className={styles.errorText}>{error}</p> : null}
          {!loading && !hasEntries ? <p className={styles.statusText}>No media yet.</p> : null}
          {folders.map((folder, folderIndex) => {
            const item: LibrarySelectionItem = { type: 'folder', id: folder.id }
            const index = folderIndex
            const selected = isLibraryItemSelected('folder', folder.id)
            return (
              <div
                key={folder.id}
                className={`${styles.libraryRow} ${selected ? styles.libraryRowSelected : ''} ${draggingAssetId && dragOverTarget === folder.id ? styles.libraryRowDrop : ''}`}
                onClick={(e) => handleLibraryItemClick(e, item, index)}
                onContextMenu={(e) => handleLibraryContextMenu(e, item, index)}
                onDragOver={(e) => {
                  if (!draggingAssetId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverTarget(folder.id)
                }}
                onDrop={(e) => {
                  if (!draggingAssetId) return
                  e.preventDefault()
                  const id = parseAccountMediaDragData(e.dataTransfer)?.id ?? e.dataTransfer.getData('text/plain')
                  if (id) void handleDropOnFolder(folder.id, id)
                  endDragVisuals()
                }}
              >
                <span className={styles.libraryAssetName}>
                  <span className={styles.libraryKindBadge}>folder</span>
                  {folder.name}
                </span>
                <div className={styles.libraryRowActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.rowActionButton}
                    onClick={() =>
                      setMoveModal({
                        type: 'folder',
                        folderId: folder.id,
                        name: folder.name,
                        parentId: folder.parent_id,
                      })
                    }
                  >
                    Move
                  </button>
                  <button type="button" className={styles.rowActionButton} onClick={() => setNameModal({ type: 'rename-folder', folderId: folder.id, initialValue: folder.name })}>
                    Rename
                  </button>
                  <button type="button" className={styles.rowActionButton} onClick={() => setDeleteModal({ type: 'folder', folderId: folder.id, name: folder.name })}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
          {assets.map((asset, assetIndex) => {
            const item: LibrarySelectionItem = { type: 'asset', id: asset.id }
            const index = folders.length + assetIndex
            const selected = isLibraryItemSelected('asset', asset.id)
            return (
              <div
                key={asset.id}
                className={`${styles.libraryRow} ${selected ? styles.libraryRowSelected : ''}`}
                draggable
                title="Drag onto the timeline to add · Shift-click to multi-select"
                onClick={(e) => handleLibraryItemClick(e, item, index)}
                onContextMenu={(e) => handleLibraryContextMenu(e, item, index)}
                onDragStart={(e) => {
                  setDraggingAssetId(asset.id)
                  setAccountMediaDragData(e.dataTransfer, {
                    id: asset.id,
                    kind: asset.kind,
                    name: asset.name,
                  })
                }}
                onDragEnd={endDragVisuals}
              >
                <span className={styles.libraryAssetName}>
                  <span className={styles.libraryKindBadge}>{asset.kind}</span>
                  {asset.name}
                </span>
                <div className={styles.libraryRowActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.rowActionButton}
                    onClick={() =>
                      setMoveModal({
                        type: 'asset',
                        assetId: asset.id,
                        name: asset.name,
                        folderId: asset.folder_id,
                      })
                    }
                  >
                    Move
                  </button>
                  <button type="button" className={styles.rowActionButton} onClick={() => setNameModal({ type: 'rename-asset', assetId: asset.id, initialValue: asset.name })}>
                    Rename
                  </button>
                  <button type="button" className={styles.rowActionButton} onClick={() => setDeleteModal({ type: 'asset', assetId: asset.id, name: asset.name })}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className={styles.shapesDropdown}>
          <button
            type="button"
            className={styles.shapesToggle}
            onClick={() => setShapesOpen((open) => !open)}
            aria-expanded={shapesOpen}
            aria-controls="account-panel-shapes-panel"
          >
            <span>Shapes</span>
            <svg
              className={`${styles.shapesChevron} ${shapesOpen ? styles.shapesChevronOpen : ''}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {shapesOpen ? (
            <div id="account-panel-shapes-panel" className={styles.shapesPanel}>
              <SolidColorPresetStrip onPick={(shape, color, name) => void addSolidShapePresetAtPlayhead(color, name, shape)} />
            </div>
          ) : null}
        </div>
      </div>

      {showPaymentModal && <PaymentModal onClose={() => setShowPaymentModal(false)} />}
      {projectModalOpen ? (
        <ProjectSelectModal
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={(projectId) => onSelectProject(projectId)}
          onClose={() => setProjectModalOpen(false)}
        />
      ) : null}

      {deleteModal?.type === 'project' && activeProjectId ? (
        <DeleteConfirmModal
          title="Delete project"
          itemName={projects.find((project) => project.id === activeProjectId)?.name ?? 'Untitled'}
          onClose={() => setDeleteModal(null)}
          onConfirm={performDeleteProject}
        />
      ) : null}

      {deleteModal?.type === 'folder' ? (
        <DeleteConfirmModal
          title="Delete folder"
          itemName={deleteModal.name}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => performDeleteFolder(deleteModal.folderId)}
        />
      ) : null}

      {deleteModal?.type === 'asset' ? (
        <DeleteConfirmModal
          title="Delete media"
          itemName={deleteModal.name}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => deleteAsset(deleteModal.assetId)}
        />
      ) : null}

      {deleteModal?.type === 'selection' ? (
        <DeleteConfirmModal
          title="Delete items"
          itemName={deleteModal.name}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => performDeleteSelection(deleteModal.assetIds, deleteModal.folderIds)}
        />
      ) : null}

      {nameModal?.type === 'new-project' ? (
        <MediaNameModal
          title="New project"
          initialValue=""
          confirmLabel="Create"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            const response = await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            })
            const body = await response.json().catch(() => null)
            if (!response.ok || !body?.project?.id) {
              throw new Error(body?.error ?? 'Failed to create project')
            }
            window.dispatchEvent(new Event('projects-updated'))
            onSelectProject(body.project.id)
          }}
        />
      ) : null}

      {nameModal?.type === 'rename-project' ? (
        <MediaNameModal
          title="Rename project"
          initialValue={nameModal.initialValue}
          confirmLabel="Save"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            if (!activeProjectId) throw new Error('No project selected')
            const response = await fetch('/api/projects', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId: activeProjectId, name }),
            })
            const body = await response.json().catch(() => null)
            if (!response.ok || !body?.project?.id) {
              throw new Error(body?.error ?? 'Failed to rename project')
            }
            window.dispatchEvent(new Event('projects-updated'))
          }}
        />
      ) : null}

      {nameModal?.type === 'new-folder' ? (
        <MediaNameModal
          title="New folder"
          description="Create a folder in the current location."
          initialValue=""
          confirmLabel="Create"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            await createFolder(name)
          }}
        />
      ) : null}

      {nameModal?.type === 'new-folder-and-move' ? (
        <MediaNameModal
          title="Move to new folder"
          description={`Create a folder and move ${selectionLabel} into it.`}
          initialValue=""
          confirmLabel="Create & move"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            const folder = await createFolder(name)
            await moveSelectedItems(folder.id)
          }}
        />
      ) : null}

      {nameModal?.type === 'rename-folder' ? (
        <MediaNameModal
          title="Rename folder"
          initialValue={nameModal.initialValue}
          confirmLabel="Save"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            await renameFolder(nameModal.folderId, name)
            setFolderTrail((prev) => prev.map((entry) => (entry.id === nameModal.folderId ? { ...entry, name } : entry)))
          }}
        />
      ) : null}

      {nameModal?.type === 'rename-asset' ? (
        <MediaNameModal
          title="Rename media"
          description="Display name only. The original file name is unchanged."
          initialValue={nameModal.initialValue}
          confirmLabel="Save"
          onClose={() => setNameModal(null)}
          onConfirm={async (name) => {
            await renameAsset(nameModal.assetId, name)
          }}
        />
      ) : null}

      {moveModal?.type === 'asset' ? (
        <MoveMediaModal
          itemName={moveModal.name}
          itemType="asset"
          currentParentId={moveModal.folderId}
          onClose={() => setMoveModal(null)}
          onMove={async (folderId) => {
            await moveAsset(moveModal.assetId, folderId)
          }}
        />
      ) : null}
      {moveModal?.type === 'folder' ? (
        <MoveMediaModal
          itemName={moveModal.name}
          itemType="folder"
          currentParentId={moveModal.parentId}
          movingFolderId={moveModal.folderId}
          onClose={() => setMoveModal(null)}
          onMove={async (parentId) => {
            await moveFolder(moveModal.folderId, parentId)
          }}
        />
      ) : null}
      {moveModal?.type === 'selection' ? (
        <MoveMediaModal
          itemName={moveModal.name}
          itemType={moveModal.assetIds.length > 0 && moveModal.folderIds.length > 0 ? 'mixed' : moveModal.folderIds.length > 0 ? 'folder' : 'asset'}
          itemCount={moveModal.itemCount}
          currentParentId={currentFolderId}
          movingFolderIds={moveModal.folderIds}
          onClose={() => setMoveModal(null)}
          onMove={async (parentId) => {
            if (moveModal.assetIds.length > 0) {
              await moveAssets(moveModal.assetIds, parentId)
            }
            if (moveModal.folderIds.length > 0) {
              await moveFolders(moveModal.folderIds, parentId)
            }
            clearLibrarySelection()
          }}
        />
      ) : null}

      {libraryContextMenu && selectedItems.length > 0 ? (
        <div
          ref={libraryContextMenuRef}
          className={styles.libraryContextMenu}
          style={{ left: libraryContextMenu.x, top: libraryContextMenu.y }}
          role="menu"
        >
          <button type="button" className={styles.libraryContextMenuItem} role="menuitem" onClick={openMoveForSelection}>
            Move to folder…
          </button>
          <button type="button" className={styles.libraryContextMenuItem} role="menuitem" onClick={openNewFolderAndMove}>
            Move to new folder…
          </button>
          <div className={styles.libraryContextMenuSeparator} />
          <button
            type="button"
            className={`${styles.libraryContextMenuItem} ${styles.libraryContextMenuItemDanger}`}
            role="menuitem"
            onClick={openDeleteForSelection}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
