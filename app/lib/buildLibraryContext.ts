import { AccountMediaAsset, AccountMediaFolder } from '@/app/lib/accountMediaTypes'

export type SerializedLibraryFolder = {
  id: string
  name: string
  parent_id: string | null
}

export type SerializedLibraryAsset = {
  id: string
  name: string
  kind: string
  folder_id: string | null
}

export type SerializedLibrary = {
  folders: SerializedLibraryFolder[]
  assets: SerializedLibraryAsset[]
}

function folderNameById(folders: SerializedLibraryFolder[], folderId: string | null): string {
  if (!folderId) return 'Root'
  const folder = folders.find((f) => f.id === folderId)
  return folder?.name ?? folderId
}

export function buildLibraryContext(library: SerializedLibrary): string {
  const lines: string[] = ['Current account media library:']
  lines.push(
    'Folders use parent_id (null = root). Assets use folder_id (null = root). "Non-folder items" means assets only, not folders.'
  )
  lines.push('Asset and folder #N numbers are scoped per location section below.')

  const folders = [...library.folders].sort((a, b) => a.name.localeCompare(b.name))
  const assets = [...library.assets].sort((a, b) => a.name.localeCompare(b.name))

  const folderIds = new Set(folders.map((f) => f.id))
  const locationIds: Array<string | null> = [null]
  for (const folder of folders) {
    if (!locationIds.includes(folder.id)) locationIds.push(folder.id)
  }
  for (const asset of assets) {
    if (asset.folder_id && !locationIds.includes(asset.folder_id)) locationIds.push(asset.folder_id)
  }

  const sortedLocationIds = locationIds.sort((a, b) => {
    if (a === null) return -1
    if (b === null) return 1
    return folderNameById(folders, a).localeCompare(folderNameById(folders, b))
  })

  for (const locationId of sortedLocationIds) {
    const locationLabel = locationId === null ? 'Root' : `Folder "${folderNameById(folders, locationId)}" (id="${locationId}")`
    lines.push('')
    lines.push(`== ${locationLabel} ==`)

    const childFolders = folders.filter((f) => f.parent_id === locationId)
    if (childFolders.length > 0) {
      lines.push(`Folders (${childFolders.length}, parent_id${locationId === null ? '=null' : `="${locationId}"`}):`)
      childFolders.forEach((folder, i) => {
        lines.push(`  - folder #${i + 1} id="${folder.id}" name="${folder.name}"`)
      })
    } else {
      lines.push('Folders: (none)')
    }

    const locationAssets = assets.filter((a) => a.folder_id === locationId)
    if (locationAssets.length > 0) {
      lines.push(`Assets (${locationAssets.length}, folder_id${locationId === null ? '=null' : `="${locationId}"`}):`)
      locationAssets.forEach((asset, i) => {
        lines.push(`  - asset #${i + 1} id="${asset.id}" name="${asset.name}" kind=${asset.kind}`)
      })
    } else {
      lines.push('Assets: (none)')
    }
  }

  const orphanAssets = assets.filter((a) => a.folder_id && !folderIds.has(a.folder_id))
  if (orphanAssets.length > 0) {
    lines.push('')
    lines.push('== Orphan assets (folder_id references missing folder) ==')
    orphanAssets.forEach((asset, i) => {
      lines.push(`  - asset #${i + 1} id="${asset.id}" name="${asset.name}" kind=${asset.kind} folder_id="${asset.folder_id}"`)
    })
  }

  if (folders.length === 0 && assets.length === 0) {
    lines.push('')
    lines.push('(empty — no library items)')
  }

  return lines.join('\n')
}
