import { describe, expect, it, vi } from 'vitest'
import { sourceStore } from './sourceStore'

describe('sourceStore ownership', () => {
  it('frees bytes only after every owner has released them', () => {
    const freed = vi.fn()
    const off = sourceStore.onFree(freed)
    sourceStore.set('a', new ArrayBuffer(8))
    sourceStore.retain('a', 'library')
    sourceStore.retain('a', 'stitch')
    sourceStore.release('a', 'library')
    expect(sourceStore.has('a')).toBe(true)
    sourceStore.release('a', 'library') // double release is harmless
    expect(sourceStore.has('a')).toBe(true)
    sourceStore.release('a', 'stitch')
    expect(sourceStore.has('a')).toBe(false)
    expect(freed).toHaveBeenCalledWith('a')
    off()
  })

  it('ignores retain for unknown ids', () => {
    sourceStore.retain('missing', 'split')
    sourceStore.release('missing', 'split')
    expect(sourceStore.has('missing')).toBe(false)
  })
})
