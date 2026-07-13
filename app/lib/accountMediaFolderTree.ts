import type { AccountMediaFolder } from '@/app/lib/accountMediaTypes'

export function wouldCreateFolderCycle(
  folders: Pick<AccountMediaFolder, 'id' | 'parent_id'>[],
  folderId: string,
  newParentId: string | null
): boolean {
  if (newParentId === null) return false
  if (newParentId === folderId) return true
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parent_id ?? null]))
  let current: string | null = newParentId
  while (current) {
    if (current === folderId) return true
    current = parentById.get(current) ?? null
  }
  return false
}

export function collectDescendantFolderIds(
  folders: Pick<AccountMediaFolder, 'id' | 'parent_id'>[],
  rootId: string
): string[] {
  const byParent = new Map<string | null, string[]>()
  for (const folder of folders) {
    const parentId = folder.parent_id ?? null
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId)!.push(folder.id)
  }
  const out: string[] = []
  const walk = (id: string) => {
    for (const childId of byParent.get(id) ?? []) {
      out.push(childId)
      walk(childId)
    }
  }
  walk(rootId)
  return out
}

export function isRootVisibleFolder(
  folders: Pick<AccountMediaFolder, 'id' | 'parent_id'>[],
  folder: Pick<AccountMediaFolder, 'id' | 'parent_id'>
): boolean {
  const folderIds = new Set(folders.map((entry) => entry.id))
  const parentId = folder.parent_id ?? null
  return parentId === null || !folderIds.has(parentId)
}

export function filterRootVisibleFolders<T extends Pick<AccountMediaFolder, 'id' | 'parent_id' | 'name'>>(
  folders: T[]
): T[] {
  return folders
    .filter((folder) => isRootVisibleFolder(folders, folder))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function isOrphanAssetFolderId(
  folderIds: Set<string>,
  folderId: string | null
): boolean {
  if (!folderId) return false
  return !folderIds.has(folderId)
}

export function buildFolderRows(
  folders: AccountMediaFolder[]
): { id: string; name: string; depth: number }[] {
  const byParent = new Map<string | null, AccountMediaFolder[]>()
  for (const folder of folders) {
    const parentId = folder.parent_id ?? null
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId)!.push(folder)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  const out: { id: string; name: string; depth: number }[] = []
  const included = new Set<string>()
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      if (included.has(child.id)) continue
      included.add(child.id)
      out.push({ id: child.id, name: child.name, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(null, 0)

  const unreachable = folders
    .filter((folder) => !included.has(folder.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const unreachableIds = new Set(unreachable.map((folder) => folder.id))
  const pseudoRoots = unreachable.filter((folder) => {
    const parentId = folder.parent_id ?? null
    return parentId === null || !unreachableIds.has(parentId)
  })

  for (const root of pseudoRoots) {
    if (included.has(root.id)) continue
    included.add(root.id)
    out.push({ id: root.id, name: root.name, depth: 0 })
    walk(root.id, 1)
  }

  for (const folder of unreachable) {
    if (included.has(folder.id)) continue
    included.add(folder.id)
    out.push({ id: folder.id, name: folder.name, depth: 0 })
    walk(folder.id, 1)
  }

  return out
}
