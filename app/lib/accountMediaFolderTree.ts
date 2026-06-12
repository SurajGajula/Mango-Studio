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
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      out.push({ id: child.id, name: child.name, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
