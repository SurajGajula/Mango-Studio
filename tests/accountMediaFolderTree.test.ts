import { describe, expect, it } from 'vitest'
import {
  buildFolderRows,
  collectDescendantFolderIds,
  filterRootVisibleFolders,
  isOrphanAssetFolderId,
  wouldCreateFolderCycle,
} from '@/app/lib/accountMediaFolderTree'
import type { AccountMediaFolder } from '@/app/lib/accountMediaTypes'

const folders = [
  { id: 'a', parent_id: null },
  { id: 'b', parent_id: 'a' },
  { id: 'c', parent_id: 'b' },
  { id: 'd', parent_id: null },
]

function folder(
  id: string,
  parent_id: string | null,
  name = id
): AccountMediaFolder {
  return {
    id,
    user_id: 'user',
    parent_id,
    name,
    created_at: '',
    updated_at: '',
  }
}

describe('wouldCreateFolderCycle', () => {
  it('returns false when moving to root', () => {
    expect(wouldCreateFolderCycle(folders, 'b', null)).toBe(false)
  })

  it('returns true when moving into itself', () => {
    expect(wouldCreateFolderCycle(folders, 'b', 'b')).toBe(true)
  })

  it('returns true when moving into a descendant', () => {
    expect(wouldCreateFolderCycle(folders, 'a', 'c')).toBe(true)
    expect(wouldCreateFolderCycle(folders, 'b', 'c')).toBe(true)
  })

  it('returns false for valid moves', () => {
    expect(wouldCreateFolderCycle(folders, 'b', 'd')).toBe(false)
    expect(wouldCreateFolderCycle(folders, 'c', 'a')).toBe(false)
  })
})

describe('collectDescendantFolderIds', () => {
  it('collects nested descendants', () => {
    expect(collectDescendantFolderIds(folders, 'a')).toEqual(['b', 'c'])
    expect(collectDescendantFolderIds(folders, 'b')).toEqual(['c'])
    expect(collectDescendantFolderIds(folders, 'd')).toEqual([])
  })
})

describe('filterRootVisibleFolders', () => {
  it('includes folders with missing parents so they appear at root', () => {
    const tree = [
      folder('images', null, 'images'),
      folder('audios', 'missing-parent', 'audios'),
      folder('nested', 'images', 'nested'),
    ]
    expect(filterRootVisibleFolders(tree).map((entry) => entry.id)).toEqual(['audios', 'images'])
  })
})

describe('isOrphanAssetFolderId', () => {
  it('detects assets whose folder no longer exists', () => {
    const folderIds = new Set(['images'])
    expect(isOrphanAssetFolderId(folderIds, null)).toBe(false)
    expect(isOrphanAssetFolderId(folderIds, 'images')).toBe(false)
    expect(isOrphanAssetFolderId(folderIds, 'audios')).toBe(true)
  })
})

describe('buildFolderRows', () => {
  it('includes unreachable folders at depth 0', () => {
    const tree = [
      folder('images', null, 'images'),
      folder('audios', 'deleted-parent', 'audios'),
      folder('clips', 'audios', 'clips'),
    ]
    expect(buildFolderRows(tree)).toEqual([
      { id: 'images', name: 'images', depth: 0 },
      { id: 'audios', name: 'audios', depth: 0 },
      { id: 'clips', name: 'clips', depth: 1 },
    ])
  })

  it('surfaces cycle members that cannot be reached from root', () => {
    const tree = [folder('x', 'y', 'x'), folder('y', 'x', 'y')]
    const rows = buildFolderRows(tree)
    expect(rows.map((row) => row.id).sort()).toEqual(['x', 'y'])
    expect(rows.every((row) => row.depth === 0 || row.depth === 1)).toBe(true)
  })
})
