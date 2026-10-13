import { ArrowRight, ClipboardList, Droplets, Hash, Layers, PenTool, RotateCcw, Scissors, ShieldCheck, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { PendingFile } from '../hooks/useIngest'
import { formatBytes, plural } from '../lib/format'
import type { SourceMeta } from '../lib/types'
import { DropZone } from './DropZone'
import { FileDropOverlay } from './FileDropOverlay'
import { FEATURES } from '../lib/features'
import { Thumbnail } from './Thumbnail'

export type SingleFileTool = 'split' | 'edit' | 'form' | 'watermark' | 'numbers'

const ONE_FILE_TOOLS: { id: SingleFileTool; title: string; description: string; icon: typeof Layers }[] = [
  { id: 'edit', title: 'Edit & sign', description: 'Add text, your signature, highlights, drawings, shapes and sticky notes.', icon: PenTool },
  { id: 'split', title: 'Split', description: 'Cut the PDF into parts at the pages you choose.', icon: Scissors },
  { id: 'form', title: 'Fill form', description: 'Fill in a PDF form’s fields and optionally lock the answers.', icon: ClipboardList },
  { id: 'watermark', title: 'Watermark', description: 'Stamp text like “Confidential” or your logo across pages.', icon: Droplets },
  { id: 'numbers', title: 'Page numbers', description: 'Number pages in the header or footer, in any format.', icon: Hash },
]

interface Props {
  active: boolean
  files: SourceMeta[]
  pending: PendingFile[]
  onFiles: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onStartOver: () => void
  onMerge: () => void
  /** File the one-file tools will open. */
  toolFileId: string | null
  onToolFileChange: (id: string) => void
  onOpenTool: (tool: SingleFileTool) => void
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

function Actions({ files, pending, onMerge, toolFileId, onToolFileChange, onOpenTool }: Props) {
  const selectId = useId()
  const busy = pending.length > 0
  const pages = files.reduce((n, f) => n + f.pageCount, 0)
  const target = files.find((f) => f.id === toolFileId) ?? files[0]
  const single = files.length === 1
  const tools = ONE_FILE_TOOLS.filter((t) => t.id !== 'form' || FEATURES.fillForm)

  return (
    <section aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="mb-3 text-lg font-semibold text-slate-900">
        What would you like to do?
      </h2>
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
        wide
      />

      <div className="mt-6 rounded-2xl bg-white/60 p-4 ring-1 ring-slate-200 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Work on one file</h3>
          {single ? (
            <span className="truncate text-sm text-slate-500">{target?.name}</span>
          ) : (
            <>
              <label htmlFor={selectId} className="sr-only">File to work on</label>
              <select
                id={selectId}
                value={target?.id}
                onChange={(e) => onToolFileChange(e.target.value)}
                className="min-w-0 max-w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:flex-none"
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({plural(f.pageCount, 'page')})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 ${tools.length % 3 === 0 || tools.length > 4 ? 'lg:grid-cols-3' : ''}`}>
          {tools.map(({ id, title, description, icon: Icon }) => {
            const disabled = busy || !target || (id === 'split' && target.pageCount < 2)
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onOpenTool(id)}
                aria-label={title}
                className="group flex items-start gap-3 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm disabled:hover:ring-slate-200"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-semibold text-slate-900">
                    {title}
                    <ArrowRight className="size-4 text-indigo-500 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">
                    {id === 'split' && target && target.pageCount < 2 ? 'Needs a file with at least 2 pages.' : description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
        <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden /> Your files stay on this device. You can come back
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
  wide = false,
}: {
  icon: ReactNode
  title: string
  description: string
  action: string
  onClick: () => void
  disabled: boolean
  children?: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`flex rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-indigo-200 ${wide ? 'flex-col gap-4 sm:flex-row sm:items-center' : 'flex-col'}`}>
      <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">{icon}</div>
      <div className={wide ? 'min-w-0 flex-1' : ''}>
        <h3 className={`${wide ? '' : 'mt-4'} text-base font-semibold text-slate-900`}>{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        {children}
      </div>
      <div className={wide ? 'shrink-0' : 'mt-auto pt-5'}>
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
