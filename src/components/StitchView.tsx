import { ChevronsDownUp, ChevronsUpDown, Redo2, RotateCcw, SortAsc, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SourceMeta } from '../lib/types'
import { Canvas } from './Canvas'
import { DropZone } from './DropZone'
import { PagePreview } from './PagePreview'
import { SettingsPanel } from './SettingsPanel'
import { StitchAction } from './StitchAction'
import { FileDropOverlay } from './FileDropOverlay'
import type { PendingFile } from '../hooks/useIngest'
import { usePersistentState } from '../hooks/usePersistentState'
import { stitchSignature, useStitch } from '../hooks/useStitch'
import { formatBytes, plural } from '../lib/format'
import { DEFAULT_SETTINGS, isStitchSettings } from '../lib/settings'
import { sourceStore } from '../lib/sourceStore'
import type { StitchOptions } from '../lib/types'
import { initialWorkspace, workspaceReducer, workspaceStats } from '../state/workspace'
import { WorkspaceContext, type WorkspaceContextValue } from '../state/WorkspaceContext'

const toolbarBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-200 disabled:pointer-events-none disabled:opacity-40'

interface Props {
  active: boolean
  /** The upload list. New files are added to the workspace; removed ones are taken out. */
  files: SourceMeta[]
  pending: PendingFile[]
  onAddFiles: (files: FileList | File[]) => void
  onStartOver: () => void
}

/** The merge workspace. Stays mounted while hidden so going back to the file list keeps your work. */
export function StitchView({ active, files, pending, onAddFiles, onStartOver }: Props) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const ingest = onAddFiles

  // Mirror the upload list: add each file once, and drop files removed from the list.
  const offered = useRef(new Set<string>())
  useEffect(() => {
    const ids = new Set(files.map((f) => f.id))
    const added = files.filter((f) => !offered.current.has(f.id))
    if (added.length > 0) {
      added.forEach((f) => offered.current.add(f.id))
      dispatch({ type: 'addSources', sources: added })
    }
    for (const id of offered.current) {
      if (!ids.has(id)) {
        offered.current.delete(id)
        dispatch({ type: 'removeSource', sourceId: id })
      }
    }
  }, [files])
  const stitcher = useStitch()
  const [settings, setSettings] = usePersistentState('pdf-stitch:settings:v1', DEFAULT_SETTINGS, isStitchSettings)
  const [preview, setPreview] = useState<{ segmentId: string; pageId: string } | null>(null)

  // ── Memory hygiene ────────────────────────────────────────────────────────
  // Hold the bytes of every file the workspace (or its undo history) still uses,
  // and let go as soon as it doesn't; the store frees them once nobody holds them.
  const held = useRef(new Set<string>())
  useEffect(() => {
    for (const id of Object.keys(state.sources)) {
      if (!held.current.has(id)) {
        held.current.add(id)
        sourceStore.retain(id, 'stitch')
      }
    }
    for (const id of held.current) {
      if (!state.sources[id]) {
        held.current.delete(id)
        sourceStore.release(id, 'stitch')
      }
    }
  }, [state.sources])
  useEffect(() => {
    const ids = held.current
    return () => {
      ids.forEach((id) => sourceStore.release(id, 'stitch'))
      ids.clear()
    }
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────
  const stats = useMemo(() => workspaceStats(state), [state])
  const nonEmptyCards = useMemo(
    () => state.segments.filter((s) => s.pages.some((p) => !p.excluded)).length,
    [state.segments],
  )
  const separators = settings.separatorPages ? Math.max(0, nonEmptyCards - 1) : 0
  const outputPages = stats.includedPages > 0 ? stats.includedPages + separators : 0
  const totalSize = useMemo(
    () => Object.values(state.sources).reduce((n, s) => n + s.size, 0),
    [state.sources],
  )

  const options: StitchOptions = useMemo(
    () => ({
      separatorPages: settings.separatorPages,
      pageNumbers: settings.pageNumbers,
      title: settings.fileName.replace(/\.pdf$/i, ''),
    }),
    [settings],
  )
  const signature = useMemo(
    () => stitchSignature(state.segments, options, settings.fileName),
    [state.segments, options, settings.fileName],
  )
  const stale = stitcher.status.state === 'done' && stitcher.status.signature !== signature

  const disabledReason =
    pending.length > 0
      ? 'Waiting for files to finish loading…'
      : state.segments.length === 0
        ? 'Add PDF files to get started.'
        : stats.includedPages === 0
          ? 'All pages are excluded.'
          : null

  const onStitch = useCallback(() => {
    if (disabledReason) return
    void stitcher.stitch(state.segments, options, settings.fileName)
  }, [disabledReason, stitcher, state.segments, options, settings.fileName])

  // ── Global interactions ───────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) dispatch({ type: 'undo' })
      else if ((key === 'z' && e.shiftKey) || key === 'y') dispatch({ type: 'redo' })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const openPreview = useCallback((segmentId: string, pageId: string) => setPreview({ segmentId, pageId }), [])
  const closePreview = useCallback(() => setPreview(null), [])
  const ctx: WorkspaceContextValue = useMemo(
    () => ({ dispatch, sources: state.sources, openPreview }),
    [state.sources, openPreview],
  )
  const previewSegment = preview && state.segments.find((s) => s.id === preview.segmentId)

  const hasWork = state.segments.length > 0
  const allExpanded = hasWork && state.segments.every((s) => s.expanded)

  const summary = (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        ['Files', stats.files],
        ['Pages', stats.includedPages],
        ['Output', outputPages],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 py-2">
          <dd className="text-lg font-semibold tabular-nums text-slate-900">{value.toLocaleString()}</dd>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        </div>
      ))}
    </dl>
  )

  const actionProps = {
    status: stitcher.status,
    disabledReason,
    stale,
    outputPages,
    onStitch,
    onCancel: stitcher.cancel,
    onDownloadAgain: stitcher.downloadAgain,
    onDismiss: stitcher.dismiss,
  }

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div hidden={!active} className={hasWork ? 'pb-28 lg:pb-0' : ''}>

        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <DropZone onFiles={ingest} pending={pending} compact={hasWork} title="Drop PDFs here to merge them" />

            {hasWork && (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="mr-auto text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">{plural(state.segments.length, 'card')}</span>
                    {' · '}
                    {stats.includedPages === stats.totalPages
                      ? plural(stats.totalPages, 'page')
                      : `${stats.includedPages} of ${plural(stats.totalPages, 'page')} selected`}
                    {' · '}
                    {formatBytes(totalSize)}
                  </p>
                  <button type="button" className={toolbarBtn} onClick={() => dispatch({ type: 'undo' })} disabled={state.past.length === 0} title="Undo (Ctrl+Z)">
                    <Undo2 className="size-4" aria-hidden /> Undo
                  </button>
                  <button type="button" className={toolbarBtn} onClick={() => dispatch({ type: 'redo' })} disabled={state.future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                    <Redo2 className="size-4" aria-hidden />
                  </button>
                  <button type="button" className={toolbarBtn} onClick={() => dispatch({ type: 'setAllExpanded', expanded: !allExpanded })}>
                    {allExpanded ? <ChevronsDownUp className="size-4" aria-hidden /> : <ChevronsUpDown className="size-4" aria-hidden />}
                    {allExpanded ? 'Collapse all' : 'Expand all'}
                  </button>
                  <button type="button" className={toolbarBtn} onClick={() => dispatch({ type: 'sortSegments' })} disabled={state.segments.length < 2}>
                    <SortAsc className="size-4" aria-hidden /> Sort A–Z
                  </button>
                  <button type="button" className={`${toolbarBtn} hover:text-red-600`} onClick={onStartOver}>
                    <RotateCcw className="size-4" aria-hidden /> Start over
                  </button>
                </div>
                <p className="-mt-2 text-xs text-slate-500">
                  Drag cards by the handle to reorder files. Expand a card and drag pages to reorder them, move them to another card, or split them into a new section.
                </p>
                <Canvas segments={state.segments} />
              </>
            )}
          </div>

          <aside className="lg:sticky lg:top-20">
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              summary={summary}
              action={
                <div className="hidden lg:block">
                  <StitchAction {...actionProps} variant="panel" />
                </div>
              }
            />
            <p className="mt-3 px-1 text-xs leading-relaxed text-slate-500">
              Everything happens in this browser tab using pdf-lib. Your documents are never sent to a server. Bookmarks and form fields from source files are not carried over.
            </p>
          </aside>
        </main>

        {hasWork && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
            <div className="mx-auto max-w-xl">
              <StitchAction {...actionProps} variant="bar" />
            </div>
          </div>
        )}
      </div>

      {active && <FileDropOverlay onFiles={ingest} label="Drop to add PDFs" />}

      {active && preview && previewSegment && (
        <PagePreview
          segment={previewSegment}
          pageId={preview.pageId}
          onNavigate={(pageId) => setPreview({ segmentId: previewSegment.id, pageId })}
          onClose={closePreview}
        />
      )}
    </WorkspaceContext.Provider>
  )
}
