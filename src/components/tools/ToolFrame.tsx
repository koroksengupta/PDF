import { CheckCircle2, Download, ExternalLink, FilePlus2, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { PendingFile } from '../../hooks/useIngest'
import type { TransformStatus } from '../../hooks/useTransform'
import { useToasts } from '../../hooks/useToasts'
import { triggerDownload } from '../../lib/dom'
import { formatBytes, plural } from '../../lib/format'
import { SWATCHES } from './toolStyles'
import { sourceStore } from '../../lib/sourceStore'
import type { SourceMeta } from '../../lib/types'
import { DropZone } from '../DropZone'
import { FileDropOverlay } from '../FileDropOverlay'
import { Thumbnail } from '../Thumbnail'

export interface ToolFrameProps {
  active: boolean
  file: SourceMeta | null
  pending: PendingFile[]
  /** Adds a file to the upload list and makes it this tool's file. */
  onChooseFile: (files: FileList | File[]) => void
  onRemoveFile: () => void
  /** Adds a produced PDF to the upload list (so tools can be chained). */
  onAddToFiles: (file: File) => void
}

/**
 * Shell for tools that work on one file: drop zone when empty, file header, and the
 * tool body (keyed by file so switching files starts fresh).
 */
export function ToolFrame({
  active,
  file,
  pending,
  onChooseFile,
  onRemoveFile,
  emptyTitle,
  children,
}: ToolFrameProps & { emptyTitle: string; children: (file: SourceMeta) => ReactNode }) {
  const { push } = useToasts()
  const chooseOne = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      if (list.length > 1) {
        push({ kind: 'warning', title: 'One file at a time', description: `Using “${list[0].name}”.` })
      }
      onChooseFile([list[0]])
    },
    [onChooseFile, push],
  )

  const fileId = file?.id
  useEffect(() => {
    if (!fileId) return
    sourceStore.retain(fileId, 'tool')
    return () => sourceStore.release(fileId, 'tool')
  }, [fileId])

  return (
    <div hidden={!active}>
      {file ? (
        <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6" key={file.id}>
          <FileHeader file={file} busy={pending.length > 0} onReplace={chooseOne} onRemove={onRemoveFile} />
          {children(file)}
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <DropZone onFiles={chooseOne} pending={pending} compact={false} multiple={false} title={emptyTitle} hint="one file at a time" />
        </main>
      )}
      {active && <FileDropOverlay onFiles={chooseOne} label={file ? 'Drop to use a different PDF' : 'Drop a PDF'} />}
    </div>
  )
}

function FileHeader({
  file,
  busy,
  onReplace,
  onRemove,
}: {
  file: SourceMeta
  busy: boolean
  onReplace: (files: FileList | File[]) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
        <Thumbnail sourceId={file.id} index={0} rotation={0} cssSize={48} eager className="size-full" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base" title={file.name}>
          {file.name}
        </h2>
        <p className="text-xs text-slate-500">
          {plural(file.pageCount, 'page')} · {formatBytes(file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        <span className="hidden sm:inline">Another file</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="size-[18px]" aria-hidden />
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files) onReplace(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}

/** Primary action plus the result card shared by the single-file tools. */
export function ToolAction({
  label,
  icon,
  status,
  disabledReason,
  stale,
  onRun,
  onCancel,
  onDismiss,
  onAddToFiles,
}: {
  label: string
  icon: ReactNode
  status: TransformStatus
  disabledReason: string | null
  stale: boolean
  onRun: () => void
  onCancel: () => void
  onDismiss: () => void
  onAddToFiles: (file: File) => void
}) {
  if (status.state === 'running') {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Loader2 className="size-4 animate-spin text-indigo-600" aria-hidden /> Creating your PDF…
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-indigo-600" />
        </div>
        <button type="button" onClick={onCancel} className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    )
  }

  const button = (
    <button
      type="button"
      onClick={onRun}
      disabled={disabledReason !== null}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
    >
      {icon}
      {label}
    </button>
  )

  if (status.state !== 'done') {
    return (
      <div className="space-y-2">
        {button}
        {disabledReason && <p className="text-center text-xs text-slate-500">{disabledReason}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-xl p-3 ring-1 ${stale ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${stale ? 'text-amber-600' : 'text-emerald-600'}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900" title={status.fileName}>{status.fileName}</p>
            <p className="text-xs text-slate-600">{formatBytes(status.size)}</p>
            {stale && <p className="mt-1 text-xs font-medium text-amber-700">Settings changed since. Create it again to update.</p>}
          </div>
          <button type="button" onClick={onDismiss} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Dismiss result">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => triggerDownload(status.url, status.fileName)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:text-sm">
            <Download className="size-4" aria-hidden /> Download
          </button>
          <a href={status.url} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:text-sm">
            <ExternalLink className="size-4" aria-hidden /> Open
          </a>
          <button
            type="button"
            onClick={() => onAddToFiles(new File([status.blob], status.fileName, { type: 'application/pdf' }))}
            title="Add the result to your files, e.g. to merge it or edit it further"
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:text-sm"
          >
            <FilePlus2 className="size-4" aria-hidden /> Add to files
          </button>
        </div>
      </div>
      {stale && button}
    </div>
  )
}

/** Card wrapper for tool settings panels. */
export function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 [&>svg]:size-4">
        {icon} {title}
      </h2>
      {children}
    </div>
  )
}


export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-300">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm transition ${
            value === o.value ? 'bg-indigo-600 font-medium text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}


export function ColorSwatches({ value, onChange, colors = SWATCHES }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => onChange(c)}
          className={`size-7 rounded-full ring-offset-2 transition ${value.toLowerCase() === c ? 'ring-2 ring-indigo-500' : 'ring-1 ring-black/10 hover:scale-110'}`}
          style={{ background: c }}
        />
      ))}
      <label className="relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/10" title="Custom colour">
        <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0" aria-label="Custom colour" />
      </label>
    </div>
  )
}
