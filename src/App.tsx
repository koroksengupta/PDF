import {
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  Redo2,
  ShieldCheck,
  SortAsc,
  Trash2,
  Undo2,
  UploadCloud,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { DropZone } from './components/DropZone'
import { PagePreview } from './components/PagePreview'
import { SettingsPanel } from './components/SettingsPanel'
import { StitchAction } from './components/StitchAction'
import { Toaster } from './components/Toaster'
import { useIngest } from './hooks/useIngest'
import { usePersistentState } from './hooks/usePersistentState'
import { stitchSignature, useStitch } from './hooks/useStitch'
import { hasFiles } from './lib/dom'
import { formatBytes, plural } from './lib/format'
import { DEFAULT_SETTINGS, isStitchSettings } from './lib/settings'
import { sourceStore } from './lib/sourceStore'
import { thumbnails } from './lib/thumbnails'
import type { StitchOptions } from './lib/types'
import { initialWorkspace, workspaceReducer, workspaceStats } from './state/workspace'
import { WorkspaceContext, type WorkspaceContextValue } from './state/WorkspaceContext'

const toolbarBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-200 disabled:pointer-events-none disabled:opacity-40'

export default function App() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const { ingest, pending } = useIngest(dispatch)
  const stitcher = useStitch()
  const [settings, setSettings] = usePersistentState('pdf-stitch:settings:v1', DEFAULT_SETTINGS, isStitchSettings)
  const [preview, setPreview] = useState<{ segmentId: string; pageId: string } | null>(null)
  const [windowDrag, setWindowDrag] = useState(false)

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
  useEffect(() => () => thumbnails.releaseAll(), [])

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
  }, [])

  // Accept files dropped anywhere on the page, not just on the drop zone.
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setWindowDrag(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setWindowDrag(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault() // otherwise the browser opens the PDF itself
    }
    const drop = (e: DragEvent) => {
      depth = 0
      setWindowDrag(false)
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer?.files.length) ingest(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [ingest])

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
      <div className={`min-h-screen ${hasWork ? 'pb-28 lg:pb-0' : ''}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Layers className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-slate-900 sm:text-lg">PDF Stitch</h1>
              <p className="hidden text-xs text-slate-500 sm:block">Merge, reorder &amp; rotate PDFs — privately, in your browser</p>
            </div>
            <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 md:inline-flex">
              <ShieldCheck className="size-3.5" aria-hidden /> 100% local · nothing is uploaded
            </span>
            <div className="ml-auto flex items-center gap-1 md:ml-2">
              <button
                type="button"
                onClick={() => dispatch({ type: 'undo' })}
                disabled={state.past.length === 0}
                className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'redo' })}
                disabled={state.future.length === 0}
                className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>

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

      {windowDrag && (
        <div className="pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-indigo-600/10 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-indigo-500 bg-white/95 px-12 py-10 text-center shadow-2xl">
            <UploadCloud className="size-10 text-indigo-600" aria-hidden />
            <p className="mt-3 text-lg font-semibold text-slate-900">Drop to add PDFs</p>
          </div>
        </div>
      )}

      {preview && previewSegment && (
        <PagePreview
          segment={previewSegment}
          pageId={preview.pageId}
          onNavigate={(pageId) => setPreview({ segmentId: previewSegment.id, pageId })}
          onClose={closePreview}
        />
      )}
      <Toaster />
    </WorkspaceContext.Provider>
  )
}
