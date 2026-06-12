import { describe, expect, it } from 'vitest'
import { collectDescendantFolderIds, wouldCreateFolderCycle } from '@/app/lib/accountMediaFolderTree'

const folders = [
  { id: 'a', parent_id: null },
  { id: 'b', parent_id: 'a' },
  { id: 'c', parent_id: 'b' },
  { id: 'd', parent_id: null },
]

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
