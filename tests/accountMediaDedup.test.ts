import { describe, expect, it } from 'vitest'
import { computeMediaContentHash } from '@/app/lib/accountMediaDedup'

describe('accountMediaDedup', () => {
  it('computes a stable sha256 hash for file bytes', () => {
    const first = new TextEncoder().encode('same-image-bytes')
    const second = new TextEncoder().encode('same-image-bytes')
    const different = new TextEncoder().encode('different-image-bytes')

    expect(computeMediaContentHash(first.buffer)).toBe(computeMediaContentHash(second.buffer))
    expect(computeMediaContentHash(first.buffer)).not.toBe(computeMediaContentHash(different.buffer))
  })
})
