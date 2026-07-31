import { useCallback, useEffect, useState } from 'react'
import { AccountMediaAsset, AccountMediaFolder } from '@/app/lib/accountMediaTypes'

type ListResponse = {
  folders: AccountMediaFolder[]
  assets: AccountMediaAsset[]
}

const listRequestCache = new Map<string, Promise<ListResponse>>()

export function useAccountMediaLibrary(enabled: boolean) {
  const [folders, setFolders] = useState<AccountMediaFolder[]>([])
  const [assets, setAssets] = useState<AccountMediaAsset[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (currentFolderId) params.set('folderId', currentFolderId)
    if (search.trim().length > 0) params.set('search', search.trim())
    const requestKey = params.toString()
    const existing = listRequestCache.get(requestKey)
    const request =
      existing ??
      fetch(`/api/media/list?${requestKey}`, { method: 'GET' })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(body?.error ?? 'Failed to load media')
          }
          return (await response.json()) as ListResponse
        })
        .finally(() => {
          listRequestCache.delete(requestKey)
        })
    if (!existing) {
      listRequestCache.set(requestKey, request)
    }
    try {
      const json = await request
      setFolders(json.folders ?? [])
      setAssets(json.assets ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load media'
      setError(message)
      setLoading(false)
      return
    }
    setLoading(false)
  }, [enabled, currentFolderId, search])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    if (!enabled) return
    const onMediaUpdated = () => void fetchList()
    window.addEventListener('account-media-updated', onMediaUpdated)
    return () => window.removeEventListener('account-media-updated', onMediaUpdated)
  }, [enabled, fetchList])

  const createFolder = useCallback(
    async (name: string) => {
      const response = await fetch('/api/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to create folder')
      }
      const json = (await response.json()) as { folder: AccountMediaFolder }
      await fetchList()
      window.dispatchEvent(new Event('account-media-updated'))
      return json.folder
    },
    [currentFolderId, fetchList]
  )

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      const previousFolders = folders
      setFolders((prev) => prev.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)))
      const response = await fetch('/api/media/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, name }),
      })
      if (!response.ok) {
        setFolders(previousFolders)
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to rename folder')
      }
      window.dispatchEvent(new Event('account-media-updated'))
      void fetchList()
    },
    [fetchList, folders]
  )

  const renameAsset = useCallback(
    async (assetId: string, name: string) => {
      const previousAssets = assets
      setAssets((prev) => prev.map((asset) => (asset.id === assetId ? { ...asset, name } : asset)))
      const response = await fetch('/api/media/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, name }),
      })
      if (!response.ok) {
        setAssets(previousAssets)
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to rename asset')
      }
      window.dispatchEvent(new Event('account-media-updated'))
      void fetchList()
    },
    [assets, fetchList]
  )

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const params = new URLSearchParams()
      params.set('folderId', folderId)
      const response = await fetch(`/api/media/delete?${params.toString()}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to delete folder')
      }
      await fetchList()
      window.dispatchEvent(new Event('account-media-updated'))
    },
    [fetchList]
  )

  const deleteAsset = useCallback(
    async (assetId: string) => {
      const params = new URLSearchParams()
      params.set('assetId', assetId)
      const response = await fetch(`/api/media/delete?${params.toString()}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to delete asset')
      }
      await fetchList()
      window.dispatchEvent(new Event('account-media-updated'))
    },
    [fetchList]
  )

  const moveAssets = useCallback(
    async (assetIds: string[], folderId: string | null) => {
      const uniqueIds = [...new Set(assetIds)].filter(Boolean)
      if (uniqueIds.length === 0) return
      const previousAssets = assets
      const idSet = new Set(uniqueIds)
      setAssets((prev) =>
        prev.filter((asset) => (idSet.has(asset.id) ? folderId === currentFolderId : true))
      )
      try {
        for (const assetId of uniqueIds) {
          const response = await fetch('/api/media/move', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId, folderId }),
          })
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(body?.error ?? 'Failed to move asset')
          }
        }
      } catch (error) {
        setAssets(previousAssets)
        throw error
      }
      window.dispatchEvent(new Event('account-media-updated'))
      void fetchList()
    },
    [assets, currentFolderId, fetchList]
  )

  const moveAsset = useCallback(
    async (assetId: string, folderId: string | null) => {
      await moveAssets([assetId], folderId)
    },
    [moveAssets]
  )

  const moveFolders = useCallback(
    async (folderIds: string[], parentId: string | null) => {
      const uniqueIds = [...new Set(folderIds)].filter(Boolean)
      if (uniqueIds.length === 0) return
      const previousFolders = folders
      const idSet = new Set(uniqueIds)
      setFolders((prev) =>
        prev.filter((folder) => (idSet.has(folder.id) ? parentId === currentFolderId : true))
      )
      try {
        for (const folderId of uniqueIds) {
          const response = await fetch('/api/media/move', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId, parentId }),
          })
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(body?.error ?? 'Failed to move folder')
          }
        }
      } catch (error) {
        setFolders(previousFolders)
        throw error
      }
      window.dispatchEvent(new Event('account-media-updated'))
      void fetchList()
    },
    [currentFolderId, fetchList, folders]
  )

  const moveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      await moveFolders([folderId], parentId)
    },
    [moveFolders]
  )

  return {
    folders,
    assets,
    currentFolderId,
    setCurrentFolderId,
    search,
    setSearch,
    loading,
    error,
    refresh: fetchList,
    createFolder,
    renameFolder,
    renameAsset,
    deleteFolder,
    deleteAsset,
    moveAsset,
    moveAssets,
    moveFolder,
    moveFolders,
  }
}
