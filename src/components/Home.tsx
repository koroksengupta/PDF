import { ArrowRight, Layers, RotateCcw, Scissors, ShieldCheck, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { PendingFile } from '../hooks/useIngest'
import { formatBytes, plural } from '../lib/format'
import type { SourceMeta } from '../lib/types'
import { DropZone } from './DropZone'
import { FileDropOverlay } from './FileDropOverlay'
import { Thumbnail } from './Thumbnail'

interface Props {
  active: boolean
  files: SourceMeta[]
  pending: PendingFile[]
  onFiles: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onStartOver: () => void
  onMerge: () => void
  splitId: string | null
  onSplitIdChange: (id: string) => void
  onSplit: () => void
}

/** Step 1: upload. Step 2: choose what to do with the files. */
export function Home(props: Props) {
  const { active, files, pending, onFiles } = props
  const hasFiles = files.length > 0

  return (
    <div hidden={!active}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {!hasFiles && (
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Merge or split PDFs, privately</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
              Upload your files first, then choose what to do with them. Everything runs in this browser tab, and nothing is
              uploaded to a server.
            </p>
          </div>
        )}

        {hasFiles ? (
          <div className="space-y-8">
            <FileList {...props} />
            <Actions {...props} />
          </div>
        ) : (
          <DropZone
            onFiles={onFiles}
            pending={pending}
            compact={false}
            title="Drop your PDFs here"
            hint="then choose to merge or split them"
          />
        )}
      </main>
      {active && <FileDropOverlay onFiles={onFiles} label="Drop to add PDFs" />}
    </div>
  )
}

function FileList({ files, pending, onFiles, onRemove, onStartOver }: Props) {
  const pages = files.reduce((n, f) => n + f.pageCount, 0)
  const size = files.reduce((n, f) => n + f.size, 0)
  return (
    <section aria-labelledby="files-heading">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="files-heading" className="text-lg font-semibold text-slate-900">
          Your files
        </h2>
        <p className="text-sm text-slate-500">
          {plural(files.length, 'file')} · {plural(pages, 'page')} · {formatBytes(size)}
        </p>
        <button
          type="button"
          onClick={onStartOver}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-white hover:text-red-600 hover:shadow-sm"
        >
          <RotateCcw className="size-4" aria-hidden /> Start over
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
              <Thumbnail sourceId={f.id} index={0} rotation={0} cssSize={48} className="size-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900" title={f.name}>
                {f.name}
              </p>
              <p className="text-xs text-slate-500">
                {plural(f.pageCount, 'page')} · {formatBytes(f.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              aria-label={`Remove ${f.name}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <DropZone onFiles={onFiles} pending={pending} compact />
      </div>
    </section>
  )
}

function Actions({ files, pending, onMerge, splitId, onSplitIdChange, onSplit }: Props) {
  const selectId = useId()
  const busy = pending.length > 0
  const pages = files.reduce((n, f) => n + f.pageCount, 0)
  const splitFile = files.find((f) => f.id === splitId) ?? files[0]
  const single = files.length === 1

  return (
    <section aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="mb-3 text-lg font-semibold text-slate-900">
        What would you like to do?
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          icon={<Layers className="size-6" aria-hidden />}
          title="Merge PDFs"
          description={
            single
              ? 'Reorder, rotate or remove pages and save a new PDF. Add more files to combine them.'
              : `Combine ${plural(files.length, 'file')} (${plural(pages, 'page')}) into one PDF. Reorder, rotate or remove pages first.`
          }
          action="Merge"
          onClick={onMerge}
          disabled={busy}
        />
        <ActionCard
          icon={<Scissors className="size-6" aria-hidden />}
          title="Split a PDF"
          description="Cut a PDF into as many parts as you like, at the pages you choose."
          action="Split"
          onClick={onSplit}
          disabled={busy || !splitFile}
        >
          {!single && (
            <div className="mt-3">
              <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-slate-600">
                File to split
              </label>
              <select
                id={selectId}
                value={splitFile?.id}
                onChange={(e) => onSplitIdChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({plural(f.pageCount, 'page')})
                  </option>
                ))}
              </select>
            </div>
          )}
          {splitFile && splitFile.pageCount < 2 && (
            <p className="mt-2 text-xs text-amber-700">“{splitFile.name}” has a single page.</p>
          )}
        </ActionCard>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden /> Your files stay on this device. You can come back
        here at any time without losing work.
      </p>
    </section>
  )
}

function ActionCard({
  icon,
  title,
  description,
  action,
  onClick,
  disabled,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  action: string
  onClick: () => void
  disabled: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-indigo-200">
      <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">{icon}</div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {children}
      {/* Pinned to the bottom so both cards' buttons line up. */}
      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:w-auto"
        >
          {action} <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
