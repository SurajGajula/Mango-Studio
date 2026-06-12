'use client'

import { ChangeEvent, useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAuth } from './AuthProvider'
import DeleteConfirmModal from './modals/DeleteProjectModal'
import MediaNameModal from './modals/MediaNameModal'
import MoveMediaModal from './modals/MoveMediaModal'
import PaymentModal from './modals/PaymentModal'
import ProjectSelectModal from './modals/ProjectSelectModal'
import SolidColorPresetStrip from './ui/SolidColorPresetStrip'
import { addSolidShapePresetAtPlayhead } from '@/app/lib/addImageAtPlayhead'
import { parseAccountMediaDragData, setAccountMediaDragData } from '@/app/lib/accountMediaDrag'
import { useAccountMediaLibrary } from '@/app/hooks/useAccountMediaLibrary'
import { UserProject } from '@/app/lib/projectTypes'
import styles from './AccountPanel.module.css'

type NameModalState =
  | { type: 'new-project' }
  | { type: 'rename-project'; initialValue: string }
  | { type: 'new-folder' }
  | { type: 'rename-folder'; folderId: string; initialValue: string }
  | { type: 'rename-asset'; assetId: string; initialValue: string }

type DeleteModalState =
  | { type: 'project' }
  | { type: 'folder'; folderId: string; name: string }
  | { type: 'asset'; assetId: string; name: string }

type MoveModalState =
  | { type: 'asset'; assetId: string; name: string; folderId: string | null }
  | { type: 'folder'; folderId: string; name: string; parentId: string | null }

type AccountPanelProps = {
  projects: UserProject[]
  activeProjectId: string | null
  onSelectProject: (projectId: string | null) => void
}

export default function AccountPanel({ projects, activeProjectId, onSelectProject }: AccountPanelProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [folderTrail, setFolderTrail] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Root' }])
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [nameModal, setNameModal] = useState<NameModalState | null>(null)
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null)
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<'root' | string | null>(null)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null)

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
    moveFolder,
  } = useAccountMediaLibrary(true)

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

      const formData = new FormData()
      formData.append('file', file)
      if (currentFolderId) {
        formData.append('folderId', currentFolderId)
      }
      if (durationSeconds !== undefined) {
        formData.append('durationSeconds', String(durationSeconds))
      }

      const uploadResponse = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const body = await uploadResponse.json().catch(() => null)
        alert(body?.error ?? 'Upload failed')
        continue
      }

      await uploadResponse.json()
      window.dispatchEvent(new Event('account-media-updated'))
    }

    e.target.value = ''
  }

  const handleOpenFolder = (folderId: string, name: string) => {
    setCurrentFolderId(folderId)
    setFolderTrail((prev) => [...prev, { id: folderId, name }])
  }

  const handleGoToTrail = (index: number) => {
    const nextTrail = folderTrail.slice(0, index + 1)
    setFolderTrail(nextTrail)
    setCurrentFolderId(nextTrail[nextTrail.length - 1]?.id ?? null)
  }

  const handleDropOnFolder = async (folderId: string | null, assetId: string) => {
    const asset = assets.find((a) => a.id === assetId)
    const current = asset?.folder_id ?? null
    if (current === folderId) return
    try {
      await moveAsset(assetId, folderId)
    } catch (err: any) {
      alert(err?.message ?? 'Failed to move item')
    }
  }

  const handleOpenFolderRow = (e: MouseEvent, folderId: string, name: string) => {
    if (draggingAssetId) {
      e.preventDefault()
      return
    }
    handleOpenFolder(folderId, name)
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
            <button type="button" className={styles.mediaActionButton} onClick={() => uploadInputRef.current?.click()}>
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
        <div className={styles.libraryList}>
          {loading ? <p className={styles.statusText}>Loading media...</p> : null}
          {error ? <p className={styles.errorText}>{error}</p> : null}
          {!loading && !hasEntries ? <p className={styles.statusText}>No media yet.</p> : null}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`${styles.libraryRow} ${draggingAssetId && dragOverTarget === folder.id ? styles.libraryRowDrop : ''}`}
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
              <button
                type="button"
                className={styles.libraryPrimaryButton}
                onClick={(e) => handleOpenFolderRow(e, folder.id, folder.name)}
              >
                {folder.name}
              </button>
              <div className={styles.libraryRowActions}>
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
          ))}
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={styles.libraryRow}
              draggable
              title="Drag onto the timeline to add"
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
              <span className={styles.libraryAssetName}>{asset.name}</span>
              <div className={styles.libraryRowActions}>
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
          ))}
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
    </div>
  )
}
