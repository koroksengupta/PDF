import type { PageRef, Rotation, Segment, SourceMeta } from '../lib/types'

export const NEW_SEGMENT_DROP_ID = '__new-segment__'
const HISTORY_LIMIT = 50

export interface WorkspaceState {
  /** Every source still referenced by the present or by undo/redo history. */
  sources: Record<string, SourceMeta>
  segments: Segment[]
  past: Segment[][]
  future: Segment[][]
  /** Counter used to name sections created by dropping pages onto the canvas. */
  sectionCounter: number
}

export type WorkspaceAction =
  | { type: 'addSources'; sources: SourceMeta[] }
  | { type: 'removeSegment'; segmentId: string }
  | { type: 'renameSegment'; segmentId: string; name: string }
  | { type: 'toggleExpanded'; segmentId: string }
  | { type: 'setAllExpanded'; expanded: boolean }
  | { type: 'moveSegment'; from: number; to: number }
  | { type: 'sortSegments' }
  | {
      type: 'movePage'
      fromSegmentId: string
      fromIndex: number
      /** Target segment id, or NEW_SEGMENT_DROP_ID to split the page into a new card. */
      toSegmentId: string
      toIndex: number
    }
  | { type: 'rotatePage'; segmentId: string; pageId: string; delta: number }
  | { type: 'toggleExcluded'; segmentId: string; pageId: string }
  | { type: 'rotateSegment'; segmentId: string; delta: number }
  | { type: 'setSegmentExcluded'; segmentId: string; excluded: boolean }
  | { type: 'resetSegment'; segmentId: string }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }

export const initialWorkspace: WorkspaceState = {
  sources: {},
  segments: [],
  past: [],
  future: [],
  sectionCounter: 0,
}

let idCounter = 0
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const addRotation = (r: Rotation, delta: number): Rotation =>
  ((((r + delta) % 360) + 360) % 360) as Rotation

/** Files with up to this many pages open expanded when added. */
const AUTO_EXPAND_MAX_PAGES = 12

export function segmentFromSource(source: SourceMeta): Segment {
  return {
    id: uid('seg'),
    name: source.name.replace(/\.pdf$/i, ''),
    expanded: source.pageCount <= AUTO_EXPAND_MAX_PAGES,
    pages: Array.from({ length: source.pageCount }, (_, i) => ({
      id: uid('pg'),
      sourceId: source.id,
      sourceIndex: i,
      rotation: 0,
      excluded: false,
    })),
  }
}

function mapSegment(segments: Segment[], id: string, fn: (s: Segment) => Segment): Segment[] {
  return segments.map((s) => (s.id === id ? fn(s) : s))
}

function mapPage(segments: Segment[], segmentId: string, pageId: string, fn: (p: PageRef) => PageRef) {
  return mapSegment(segments, segmentId, (s) => ({
    ...s,
    pages: s.pages.map((p) => (p.id === pageId ? fn(p) : p)),
  }))
}

/** Drops sources nothing (present or history) points at any more. */
function collectSources(state: WorkspaceState): WorkspaceState {
  const used = new Set<string>()
  for (const snapshot of [state.segments, ...state.past, ...state.future]) {
    for (const seg of snapshot) for (const p of seg.pages) used.add(p.sourceId)
  }
  const ids = Object.keys(state.sources)
  if (ids.every((id) => used.has(id))) return state
  const sources: Record<string, SourceMeta> = {}
  for (const id of ids) if (used.has(id)) sources[id] = state.sources[id]
  return { ...state, sources }
}

/** Applies an undoable change to the segment list. */
function commit(state: WorkspaceState, segments: Segment[], extra: Partial<WorkspaceState> = {}) {
  if (segments === state.segments) return state
  // Pages may have been dragged out of a card; empty cards disappear.
  const cleaned = segments.filter((s) => s.pages.length > 0)
  return collectSources({
    ...state,
    ...extra,
    segments: cleaned,
    past: [...state.past, state.segments].slice(-HISTORY_LIMIT),
    future: [],
  })
}

/** View-only changes (expand/collapse) shouldn't clutter undo history. */
function updateView(state: WorkspaceState, segments: Segment[]) {
  return { ...state, segments }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'addSources': {
      if (action.sources.length === 0) return state
      const sources = { ...state.sources }
      for (const s of action.sources) sources[s.id] = s
      return commit({ ...state, sources }, [
        ...state.segments,
        ...action.sources.map(segmentFromSource),
      ])
    }

    case 'removeSegment':
      return commit(
        state,
        state.segments.filter((s) => s.id !== action.segmentId),
      )

    case 'renameSegment': {
      const name = action.name.trim()
      const seg = state.segments.find((s) => s.id === action.segmentId)
      if (!seg || !name || seg.name === name) return state
      return commit(state, mapSegment(state.segments, action.segmentId, (s) => ({ ...s, name })))
    }

    case 'toggleExpanded':
      return updateView(
        state,
        mapSegment(state.segments, action.segmentId, (s) => ({ ...s, expanded: !s.expanded })),
      )

    case 'setAllExpanded':
      return updateView(
        state,
        state.segments.map((s) =>
          s.expanded === action.expanded ? s : { ...s, expanded: action.expanded },
        ),
      )

    case 'moveSegment': {
      const { from, to } = action
      const n = state.segments.length
      if (from === to || from < 0 || from >= n || to < 0 || to >= n) return state
      const segments = [...state.segments]
      const [moved] = segments.splice(from, 1)
      segments.splice(to, 0, moved)
      return commit(state, segments)
    }

    case 'sortSegments': {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      const sorted = [...state.segments].sort((a, b) => collator.compare(a.name, b.name))
      if (sorted.every((s, i) => s === state.segments[i])) return state
      return commit(state, sorted)
    }

    case 'movePage': {
      const { fromSegmentId, fromIndex, toSegmentId } = action
      const fromSeg = state.segments.find((s) => s.id === fromSegmentId)
      const page = fromSeg?.pages[fromIndex]
      if (!fromSeg || !page) return state

      if (toSegmentId === NEW_SEGMENT_DROP_ID) {
        const counter = state.sectionCounter + 1
        const segments = state.segments.map((s) =>
          s === fromSeg ? { ...s, pages: s.pages.filter((_, i) => i !== fromIndex) } : s,
        )
        const created: Segment = {
          id: uid('seg'),
          name: `Section ${counter}`,
          expanded: true,
          pages: [page],
        }
        // New cards go at the end of the canvas, where the drop zone lives.
        return commit(state, [...segments, created], { sectionCounter: counter })
      }

      const toSeg = state.segments.find((s) => s.id === toSegmentId)
      if (!toSeg) return state
      // Collapsed cards render no page list, so a drop onto them appends.
      let toIndex = toSeg.expanded ? action.toIndex : toSeg.pages.length
      if (fromSeg === toSeg) {
        if (!toSeg.expanded) return state
        toIndex = Math.min(Math.max(toIndex, 0), fromSeg.pages.length - 1)
        if (toIndex === fromIndex) return state
        const pages = [...fromSeg.pages]
        pages.splice(fromIndex, 1)
        pages.splice(toIndex, 0, page)
        return commit(state, mapSegment(state.segments, fromSeg.id, (s) => ({ ...s, pages })))
      }
      toIndex = Math.min(Math.max(toIndex, 0), toSeg.pages.length)
      const segments = state.segments.map((s) => {
        if (s === fromSeg) return { ...s, pages: s.pages.filter((_, i) => i !== fromIndex) }
        if (s === toSeg) {
          const pages = [...s.pages]
          pages.splice(toIndex, 0, page)
          return { ...s, pages }
        }
        return s
      })
      return commit(state, segments)
    }

    case 'rotatePage':
      return commit(
        state,
        mapPage(state.segments, action.segmentId, action.pageId, (p) => ({
          ...p,
          rotation: addRotation(p.rotation, action.delta),
        })),
      )

    case 'toggleExcluded':
      return commit(
        state,
        mapPage(state.segments, action.segmentId, action.pageId, (p) => ({
          ...p,
          excluded: !p.excluded,
        })),
      )

    case 'rotateSegment':
      return commit(
        state,
        mapSegment(state.segments, action.segmentId, (s) => ({
          ...s,
          pages: s.pages.map((p) => ({ ...p, rotation: addRotation(p.rotation, action.delta) })),
        })),
      )

    case 'setSegmentExcluded':
      return commit(
        state,
        mapSegment(state.segments, action.segmentId, (s) => ({
          ...s,
          pages: s.pages.map((p) =>
            p.excluded === action.excluded ? p : { ...p, excluded: action.excluded },
          ),
        })),
      )

    case 'resetSegment':
      return commit(
        state,
        mapSegment(state.segments, action.segmentId, (s) => ({
          ...s,
          pages: s.pages.map((p) =>
            p.rotation === 0 && !p.excluded ? p : { ...p, rotation: 0, excluded: false },
          ),
        })),
      )

    case 'clear':
      // Not undoable: clearing is how users free the memory held by their files.
      return { ...initialWorkspace }

    case 'undo': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        ...state,
        segments: preserveExpansion(previous, state.segments),
        past: state.past.slice(0, -1),
        future: [state.segments, ...state.future],
      }
    }

    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...future] = state.future
      return {
        ...state,
        segments: preserveExpansion(next, state.segments),
        past: [...state.past, state.segments],
        future,
      }
    }
  }
}

/** Undo shouldn't flip cards open/closed just because the snapshot was taken earlier. */
function preserveExpansion(target: Segment[], current: Segment[]): Segment[] {
  const expanded = new Map(current.map((s) => [s.id, s.expanded]))
  return target.map((s) => {
    const e = expanded.get(s.id)
    return e === undefined || e === s.expanded ? s : { ...s, expanded: e }
  })
}

export interface WorkspaceStats {
  files: number
  cards: number
  totalPages: number
  includedPages: number
}

export function workspaceStats(state: WorkspaceState): WorkspaceStats {
  let totalPages = 0
  let includedPages = 0
  for (const s of state.segments) {
    totalPages += s.pages.length
    for (const p of s.pages) if (!p.excluded) includedPages++
  }
  const files = new Set(state.segments.flatMap((s) => s.pages.map((p) => p.sourceId))).size
  return { files, cards: state.segments.length, totalPages, includedPages }
}
