import { describe, expect, it } from 'vitest'
import type { SourceMeta } from '../lib/types'
import {
  NEW_SEGMENT_DROP_ID,
  initialWorkspace,
  workspaceReducer as reduce,
  workspaceStats,
  type WorkspaceAction,
  type WorkspaceState,
} from './workspace'

const src = (id: string, pageCount: number): SourceMeta => ({ id, name: `${id}.pdf`, size: 1000, pageCount })
const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state)
const layout = (s: WorkspaceState) => s.segments.map((seg) => seg.pages.map((p) => `${p.sourceId}${p.sourceIndex}`))

function withFiles() {
  return run(initialWorkspace, { type: 'addSources', sources: [src('a', 3), src('b', 2)] })
}

describe('workspace reducer', () => {
  it('creates one card per added file with every page included', () => {
    const s = withFiles()
    expect(s.segments.map((x) => x.name)).toEqual(['a', 'b'])
    expect(layout(s)).toEqual([['a0', 'a1', 'a2'], ['b0', 'b1']])
    expect(workspaceStats(s)).toEqual({ files: 2, cards: 2, totalPages: 5, includedPages: 5 })
  })

  it('reorders whole cards', () => {
    const s = run(withFiles(), { type: 'moveSegment', from: 0, to: 1 })
    expect(layout(s)).toEqual([['b0', 'b1'], ['a0', 'a1', 'a2']])
  })

  it('reorders pages within a card and moves pages between cards', () => {
    let s = withFiles()
    const [a, b] = s.segments
    s = run(s, { type: 'movePage', fromSegmentId: a.id, fromIndex: 0, toSegmentId: a.id, toIndex: 2 })
    expect(layout(s)[0]).toEqual(['a1', 'a2', 'a0'])
    s = run(s, { type: 'movePage', fromSegmentId: b.id, fromIndex: 1, toSegmentId: a.id, toIndex: 1 })
    expect(layout(s)).toEqual([['a1', 'b1', 'a2', 'a0'], ['b0']])
  })

  it('appends when dropping onto a collapsed card', () => {
    let s = withFiles()
    const [a, b] = s.segments
    s = run(s, { type: 'toggleExpanded', segmentId: a.id })
    expect(s.segments[0].expanded).toBe(false)
    s = run(s, { type: 'movePage', fromSegmentId: b.id, fromIndex: 0, toSegmentId: a.id, toIndex: 0 })
    expect(layout(s)[0]).toEqual(['a0', 'a1', 'a2', 'b0'])
  })

  it('splits a page into a new section and removes cards that become empty', () => {
    let s = withFiles()
    const b = s.segments[1]
    s = run(s, { type: 'movePage', fromSegmentId: b.id, fromIndex: 0, toSegmentId: NEW_SEGMENT_DROP_ID, toIndex: 0 })
    expect(s.segments.map((x) => x.name)).toEqual(['a', 'b', 'Section 1'])
    s = run(s, { type: 'movePage', fromSegmentId: b.id, fromIndex: 0, toSegmentId: s.segments[2].id, toIndex: 1 })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2'], ['b0', 'b1']])
    expect(s.segments[1].name).toBe('Section 1')
  })

  it('rotates and excludes pages, and whole cards', () => {
    let s = withFiles()
    const a = s.segments[0]
    s = run(
      s,
      { type: 'rotatePage', segmentId: a.id, pageId: a.pages[0].id, delta: 90 },
      { type: 'rotatePage', segmentId: a.id, pageId: a.pages[1].id, delta: -90 },
      { type: 'toggleExcluded', segmentId: a.id, pageId: a.pages[2].id },
    )
    expect(s.segments[0].pages.map((p) => [p.rotation, p.excluded])).toEqual([
      [90, false],
      [270, false],
      [0, true],
    ])
    expect(workspaceStats(s).includedPages).toBe(4)
    s = run(s, { type: 'rotateSegment', segmentId: a.id, delta: 180 })
    expect(s.segments[0].pages.map((p) => p.rotation)).toEqual([270, 90, 180])
    s = run(s, { type: 'resetSegment', segmentId: a.id })
    expect(s.segments[0].pages.every((p) => p.rotation === 0 && !p.excluded)).toBe(true)
  })

  it('undoes and redoes edits, keeping sources alive while history references them', () => {
    let s = withFiles()
    const b = s.segments[1]
    s = run(s, { type: 'removeSegment', segmentId: b.id })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2']])
    expect(Object.keys(s.sources).sort()).toEqual(['a', 'b'])
    s = run(s, { type: 'undo' })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2'], ['b0', 'b1']])
    s = run(s, { type: 'redo' })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2']])
  })

  it('releases sources once no snapshot references them', () => {
    let s = withFiles()
    const b = s.segments[1]
    s = run(s, { type: 'removeSegment', segmentId: b.id })
    // Push enough edits to evict the snapshot that still contains file b.
    for (let i = 0; i < 60; i++) {
      s = run(s, { type: 'rotateSegment', segmentId: s.segments[0].id, delta: 90 })
    }
    expect(Object.keys(s.sources)).toEqual(['a'])
    expect(s.past.length).toBeLessThanOrEqual(50)
  })

  it('does not record view-only changes or no-ops in history', () => {
    let s = withFiles()
    const before = s.past.length
    s = run(
      s,
      { type: 'setAllExpanded', expanded: false },
      { type: 'moveSegment', from: 0, to: 0 },
      { type: 'renameSegment', segmentId: s.segments[0].id, name: '   ' },
    )
    expect(s.past.length).toBe(before)
  })

  it('removes all pages of a file everywhere, including undo history, and frees the source', () => {
    let s = withFiles()
    const [a, b] = s.segments
    s = run(s, { type: 'movePage', fromSegmentId: b.id, fromIndex: 0, toSegmentId: a.id, toIndex: 0 })
    s = run(s, { type: 'removeSource', sourceId: 'b' })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2']])
    expect(Object.keys(s.sources)).toEqual(['a'])
    expect(run(s, { type: 'removeSource', sourceId: 'zzz' })).toBe(s)
    // Undo still works for other edits, but never brings file b back.
    s = run(s, { type: 'undo' })
    expect(layout(s)).toEqual([['a0', 'a1', 'a2']])
    expect(s.segments.flatMap((x) => x.pages).some((p) => p.sourceId === 'b')).toBe(false)
  })

  it('clear resets everything, including history and sources', () => {
    const s = run(withFiles(), { type: 'clear' })
    expect(s).toEqual(initialWorkspace)
  })

  it('sorts cards naturally by name', () => {
    const s = run(
      initialWorkspace,
      { type: 'addSources', sources: [src('file10', 1), src('file2', 1), src('File1', 1)] },
      { type: 'sortSegments' },
    )
    expect(s.segments.map((x) => x.name)).toEqual(['File1', 'file2', 'file10'])
  })
})
