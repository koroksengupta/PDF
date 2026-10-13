import { ChevronsDownUp, ChevronsUpDown, Redo2, SortAsc, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SourceMeta } from '../lib/types'
import { Canvas } from './Canvas'
import { DropZone } from './DropZone'
import { PagePreview } from './PagePreview'
import { SettingsPanel } from './SettingsPanel'
import { StitchAction } from './StitchAction'
import { FileDropOverlay } from './FileDropOverlay'
import { useIngest } from '../hooks/useIngest'
import { usePersistentState } from '../hooks/usePersistentState'
import { stitchSignature, useStitch } from '../hooks/useStitch'
import { formatBytes, plural } from '../lib/format'
import { DEFAULT_SETTINGS, isStitchSettings } from '../lib/settings'
import { sourceStore } from '../lib/sourceStore'
import { thumbnails } from '../lib/thumbnails'
import type { StitchOptions } from '../lib/types'
import { initialWorkspace, workspaceReducer, workspaceStats } from '../state/workspace'
import { WorkspaceContext, type WorkspaceContextValue } from '../state/WorkspaceContext'

const toolbarBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-200 disabled:pointer-events-none disabled:opacity-40'

/** The merge workspace. Stays mounted while hidden so switching tabs keeps your work. */
export function StitchView({ active }: { active: boolean }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const addSource = useCallback((meta: SourceMeta) => dispatch({ type: 'addSources', sources: [meta] }), [])
  const { ingest, pending } = useIngest(addSource)
  const stitcher = useStitch()
  const [settings, setSettings] = usePersistentState('pdf-stitch:settings:v1', DEFAULT_SETTINGS, isStitchSettings)
  const [preview, setPreview] = useState<{ segmentId: string; pageId: string } | null>(null)

  // ── Memory hygiene ────────────────────────────────────────────────────────
  // Free bytes, pdf.js documents and thumbnail object URLs of sources that left the
  // workspace (and its undo history). Only ids that were once in state are released,
  // so a file whose bytes were just stored but whose dispatch hasn't rendered is safe.
  const knownSources = useRef(new Set<string>())
  useEffect(() => {
    for (const id of Object.keys(state.sources)) knownSources.current.add(id)
    for (const id of knownSources.current) {
      if (!state.sources[id]) {
        knownSources.current.delete(id)
        sourceStore.delete(id)
        thumbnails.releaseSource(id)
      }
    }
  }, [state.sources])

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

  // Warn before leaving with work on the canvas: nothing is saved anywhere.
  useEffect(() => {
    if (state.segments.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [state.segments.length])

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
            <DropZone onFiles={ingest} pending={pending} compact={hasWork} />

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
                  <button
                    type="button"
                    className={`${toolbarBtn} hover:text-red-600`}
                    onClick={() => {
                      if (window.confirm('Remove all files from the workspace? This cannot be undone.')) {
                        dispatch({ type: 'clear' })
                        stitcher.dismiss()
                      }
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden /> Clear all
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
