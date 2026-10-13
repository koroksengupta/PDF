import { describe, expect, it } from 'vitest'
import {
  evenSplitPoints,
  partFileName,
  pointsToRanges,
  toggleSplitPoint,
  validateSplitPoints,
} from './split'

describe('evenSplitPoints', () => {
  it.each([
    [10, 2, [5]],
    [10, 3, [4, 7]],
    [9, 3, [3, 6]],
    [5, 5, [1, 2, 3, 4]],
    [7, 1, []],
    [3, 10, [1, 2]], // clamped to one page per part
  ])('%i pages into %i parts -> %j', (pages, parts, expected) => {
    expect(evenSplitPoints(pages, parts)).toEqual(expected)
  })

  it('always produces valid points', () => {
    for (let pages = 2; pages <= 60; pages++) {
      for (let parts = 2; parts <= pages; parts++) {
        const pts = evenSplitPoints(pages, parts)
        expect(pts).toHaveLength(parts - 1)
        expect(validateSplitPoints(pts, pages).valid).toBe(true)
      }
    }
  })
})

describe('validateSplitPoints', () => {
  it('flags empty, out-of-range and non-increasing points individually', () => {
    expect(validateSplitPoints([3, null, 0, 10, 2, 5], 10).errors).toEqual([
      null,
      'Enter a page number',
      'Must be between 1 and 9',
      'Must be between 1 and 9',
      'Must be after page 3',
      null,
    ])
  })

  it('needs at least one point', () => {
    expect(validateSplitPoints([], 10).valid).toBe(false)
    expect(validateSplitPoints([4], 10).valid).toBe(true)
  })
})

describe('ranges and helpers', () => {
  it('turns points into contiguous ranges covering every page', () => {
    expect(pointsToRanges([4, 7], 10)).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 7 },
      { start: 8, end: 10 },
    ])
  })

  it('toggles points and keeps them sorted', () => {
    expect(toggleSplitPoint([3, 8], 5)).toEqual([3, 5, 8])
    expect(toggleSplitPoint([3, 5, 8], 5)).toEqual([3, 8])
    expect(toggleSplitPoint([3, null], 1)).toEqual([1, 3])
  })

  it('names parts with padded indexes', () => {
    expect(partFileName('doc', 0, 12, { start: 1, end: 4 })).toBe('doc_part01_p1-4.pdf')
    expect(partFileName('doc', 2, 3, { start: 9, end: 9 })).toBe('doc_part3_p9.pdf')
  })
})
