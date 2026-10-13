import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Scissors,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react'
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PendingFile } from '../hooks/useIngest'
import { usePersistentState } from '../hooks/usePersistentState'
import { useSplit, type SplitDelivery, type SplitStatus } from '../hooks/useSplit'
import { useToasts } from '../hooks/useToasts'
import { formatBytes, plural, sanitizeFileName } from '../lib/format'
import { sourceStore } from '../lib/sourceStore'
import {
  evenSplitPoints,
  maxParts,
  pointsToRanges,
  toggleSplitPoint,
  validateSplitPoints,
  type SplitPoint,
} from '../lib/split'
import type { SourceMeta } from '../lib/types'
import { DropZone } from './DropZone'
import { FileDropOverlay } from './FileDropOverlay'
import { Thumbnail } from './Thumbnail'

/** Tints that tell neighbouring parts apart in the page grid. */
const PART_COLORS = [
  { ring: 'ring-indigo-400', badge: 'bg-indigo-600', soft: 'bg-indigo-50 text-indigo-700' },
  { ring: 'ring-emerald-400', badge: 'bg-emerald-600', soft: 'bg-emerald-50 text-emerald-700' },
  { ring: 'ring-amber-400', badge: 'bg-amber-600', soft: 'bg-amber-50 text-amber-700' },
  { ring: 'ring-rose-400', badge: 'bg-rose-600', soft: 'bg-rose-50 text-rose-700' },
  { ring: 'ring-sky-400', badge: 'bg-sky-600', soft: 'bg-sky-50 text-sky-700' },
  { ring: 'ring-violet-400', badge: 'bg-violet-600', soft: 'bg-violet-50 text-violet-700' },
]
const colorFor = (part: number) => PART_COLORS[part % PART_COLORS.length]

const isDelivery = (v: unknown): v is SplitDelivery => v === 'zip' || v === 'files'
const baseNameOf = (fileName: string) => sanitizeFileName(fileName).replace(/\.pdf$/i, '')

const inputClass =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2'

interface SplitViewProps {
  active: boolean
  file: SourceMeta | null
  pending: PendingFile[]
  /** Adds a file to the upload list and makes it the one being split. */
  onChooseFile: (files: FileList | File[]) => void
  onRemoveFile: () => void
}

export function SplitView({ active, file, pending, onChooseFile, onRemoveFile }: SplitViewProps) {
  const { push } = useToasts()

  const chooseOne = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      if (list.length > 1) {
        push({
          kind: 'warning',
          title: 'One file at a time',
          description: `Splitting works on a single PDF. Using “${list[0].name}”.`,
        })
      }
      onChooseFile([list[0]])
    },
    [onChooseFile, push],
  )

  // Hold the file's bytes while it is the one being split.
  const fileId = file?.id
  useEffect(() => {
    if (!fileId) return
    sourceStore.retain(fileId, 'split')
    return () => sourceStore.release(fileId, 'split')
  }, [fileId])

  return (
    <div hidden={!active}>
      {file ? (
        // Keyed by file: choosing another file starts with fresh settings and results.
        <SplitWorkspace key={file.id} file={file} busy={pending.length > 0} onReplace={chooseOne} onRemove={onRemoveFile} />
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <DropZone
            onFiles={chooseOne}
            pending={pending}
            compact={false}
            multiple={false}
            title="Drop a PDF here to split it"
            hint="choose how many parts and where to cut"
          />
        </main>
      )}
      {active && <FileDropOverlay onFiles={chooseOne} label={file ? 'Drop to split a different PDF' : 'Drop a PDF to split'} />}
    </div>
  )
}

function SplitWorkspace({
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
  const pageCount = file.pageCount
  const [points, setPoints] = useState<SplitPoint[]>(() => evenSplitPoints(pageCount, 2))
  const [baseName, setBaseName] = useState(() => baseNameOf(file.name))
  const [delivery, setDelivery] = usePersistentState<SplitDelivery>('pdf-stitch:split-delivery:v1', 'zip', isDelivery)
  const splitter = useSplit()

  const validation = useMemo(() => validateSplitPoints(points, pageCount), [points, pageCount])
  const ranges = useMemo(
    () => (validation.valid ? pointsToRanges(points as number[], pageCount) : null),
    [validation.valid, points, pageCount],
  )
  // Cuts to draw in the grid: the valid subset, so the preview stays useful while typing.
  const cuts = useMemo(() => {
    const valid = points.filter((p, i): p is number => p !== null && validation.errors[i] === null)
    return new Set(valid)
  }, [points, validation.errors])

  const signature = JSON.stringify([points, baseName])
  const stale = splitter.status.state === 'done' && splitter.status.signature !== signature
  const canSplit = Boolean(ranges && !busy)

  const onSplit = () => {
    if (!ranges) return
    void splitter.split({
      sourceId: file.id,
      ranges,
      baseName: baseName || baseNameOf(file.name),
      delivery,
      signature,
    })
  }

  const setParts = (n: number) => {
    const clamped = Math.min(Math.max(2, Math.trunc(n)), maxParts(pageCount))
    setPoints(evenSplitPoints(pageCount, clamped))
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <FileHeader
        file={file}
        onReplace={onReplace}
        onRemove={() => {
          splitter.cancel()
          onRemove()
        }}
        busy={busy}
      />

      <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {pageCount < 2 ? (
          <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
            This PDF has a single page, so there is nothing to split.
          </div>
        ) : (
          <SplitPanel
            pageCount={pageCount}
            points={points}
            errors={validation.errors}
            onPointsChange={setPoints}
            onPartsChange={setParts}
            baseName={baseName}
            onBaseNameChange={setBaseName}
            fallbackBaseName={baseNameOf(file.name)}
            delivery={delivery}
            onDeliveryChange={setDelivery}
            status={splitter.status}
            stale={stale}
            canSplit={canSplit}
            onSplit={onSplit}
            onCancel={splitter.cancel}
            onDismiss={splitter.dismiss}
            onDownloadParts={splitter.downloadParts}
          />
        )}
      </aside>

      <PageGrid
        sourceId={file.id}
        pageCount={pageCount}
        cuts={cuts}
        onToggleCut={(page) => setPoints((p) => toggleSplitPoint(p, page))}
      />
    </main>
  )
}

function FileHeader({
  file,
  onReplace,
  onRemove,
  busy,
}: {
  file: SourceMeta
  onReplace: (files: FileList | File[]) => void
  onRemove: () => void
  busy: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:col-start-1 lg:row-start-1">
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

/** Wrapping grid of pages; the gap after each page toggles a cut there. */
const PageGrid = memo(function PageGrid({
  sourceId,
  pageCount,
  cuts,
  onToggleCut,
}: {
  sourceId: string
  pageCount: number
  cuts: Set<number>
  onToggleCut: (afterPage: number) => void
}) {
  let part = 0
  const items = []
  for (let page = 1; page <= pageCount; page++) {
    const startsPart = page === 1 || cuts.has(page - 1)
    if (startsPart && page > 1) part++
    const color = colorFor(part)
    const cut = cuts.has(page)
    items.push(
      <div key={page} className="flex items-stretch" data-split-page={page}>
        <div className="w-[5.5rem] sm:w-24">
          <div className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 p-1.5 ring-2 ${color.ring}`}>
            <Thumbnail sourceId={sourceId} index={page - 1} rotation={0} cssSize={96} className="size-full" />
            {startsPart && (
              <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow ${color.badge}`}>
                Part {part + 1}
              </span>
            )}
          </div>
          <p className="mt-1 text-center text-xs font-medium text-slate-600">{page}</p>
        </div>
        {page < pageCount && (
          <button
            type="button"
            onClick={() => onToggleCut(page)}
            aria-pressed={cut}
            aria-label={cut ? `Remove split after page ${page}` : `Split after page ${page}`}
            title={cut ? `Remove split after page ${page}` : `Split after page ${page}`}
            className="group/cut relative mx-0.5 flex w-6 justify-center pb-5"
          >
            <span
              className={`h-full w-0.5 rounded-full transition ${
                cut ? 'bg-indigo-600' : 'bg-transparent group-hover/cut:bg-slate-300 group-focus-visible/cut:bg-slate-300'
              }`}
            />
            <span
              className={`absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition ${
                cut
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-white text-slate-400 opacity-0 shadow ring-1 ring-slate-200 group-hover/cut:opacity-100 group-focus-visible/cut:opacity-100 touch:opacity-60'
              }`}
            >
              <Scissors className="size-3.5" aria-hidden />
            </span>
          </button>
        )}
      </div>,
    )
  }

  return (
    <section
      aria-label="Pages"
      className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4 lg:col-start-1 lg:row-start-2"
    >
      <p className="mb-3 text-xs text-slate-500">
        Click the gap between two pages to add or remove a split there.
      </p>
      <div className="flex flex-wrap gap-y-3">{items}</div>
    </section>
  )
})

interface PanelProps {
  pageCount: number
  points: SplitPoint[]
  errors: (string | null)[]
  onPointsChange: (points: SplitPoint[]) => void
  onPartsChange: (n: number) => void
  baseName: string
  onBaseNameChange: (name: string) => void
  fallbackBaseName: string
  delivery: SplitDelivery
  onDeliveryChange: (d: SplitDelivery) => void
  status: SplitStatus
  stale: boolean
  canSplit: boolean
  onSplit: () => void
  onCancel: () => void
  onDismiss: () => void
  onDownloadParts: (parts: Extract<SplitStatus, { state: 'done' }>['parts']) => void
}

function SplitPanel(props: PanelProps) {
  const { pageCount, points, errors, onPointsChange, onPartsChange } = props
  const ids = { parts: useId(), name: useId() }
  const parts = points.length + 1
  const max = maxParts(pageCount)
  // While typing, show the raw text (so the field can be cleared and retyped);
  // apply it as soon as it's a usable number.
  const [partsDraft, setPartsDraft] = useState<string | null>(null)

  const commitParts = (text: string) => {
    const n = Number(text)
    if (Number.isInteger(n) && n >= 2 && n <= max) onPartsChange(n)
  }

  const rangeOf = (k: number) => {
    const start = k === 0 ? 1 : points[k - 1]
    const end = k === points.length ? pageCount : points[k]
    const startOk = k === 0 || errors[k - 1] === null
    const endOk = k === points.length || errors[k] === null
    if (!startOk || !endOk || start === null || end === null) return null
    return { start: k === 0 ? 1 : start + 1, end }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Scissors className="size-4" aria-hidden /> Split settings
      </h2>

      <div>
        <label htmlFor={ids.parts} className="mb-1 block text-xs font-medium text-slate-600">
          Number of parts
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPartsChange(parts - 1)}
            disabled={parts <= 2}
            aria-label="Fewer parts"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            id={ids.parts}
            type="number"
            inputMode="numeric"
            min={2}
            max={max}
            value={partsDraft ?? String(parts)}
            onChange={(e) => {
              setPartsDraft(e.target.value)
              commitParts(e.target.value)
            }}
            onBlur={() => setPartsDraft(null)}
            className={`${inputClass} border-slate-300 text-center text-base font-semibold focus:border-indigo-500 focus:ring-indigo-100`}
          />
          <button
            type="button"
            onClick={() => onPartsChange(parts + 1)}
            disabled={parts >= max}
            aria-label="More parts"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {parts - 1 === 1 ? 'Enter 1 page number' : `Enter ${parts - 1} page numbers`} to split after
          (2–{max} parts). Changing the count spreads the splits evenly.
        </p>
      </div>

      <ol className="space-y-1.5" aria-label="Parts">
        {Array.from({ length: parts }, (_, k) => {
          const r = rangeOf(k)
          const color = colorFor(k)
          return (
            <li key={k}>
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${color.soft}`}>
                <span className="font-semibold">Part {k + 1}</span>
                <span className="tabular-nums">
                  {r
                    ? `${r.start === r.end ? `page ${r.start}` : `pages ${r.start}–${r.end}`} · ${plural(r.end - r.start + 1, 'page')}`
                    : '—'}
                </span>
              </div>
              {k < points.length && (
                <SplitInput
                  index={k}
                  value={points[k]}
                  error={errors[k]}
                  max={pageCount - 1}
                  onChange={(v) => onPointsChange(points.map((p, i) => (i === k ? v : p)))}
                />
              )}
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        onClick={() => onPartsChange(parts)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
      >
        <Shuffle className="size-4" aria-hidden /> Distribute evenly
      </button>

      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-xs font-medium text-slate-600">
            File name prefix
          </label>
          <input
            id={ids.name}
            value={props.baseName}
            onChange={(e) => props.onBaseNameChange(e.target.value)}
            onBlur={() => props.onBaseNameChange(baseNameOf(props.baseName || props.fallbackBaseName))}
            spellCheck={false}
            autoComplete="off"
            className={`${inputClass} border-slate-300 focus:border-indigo-500 focus:ring-indigo-100`}
          />
          <p className="mt-1 truncate text-xs text-slate-500">
            e.g. {props.baseName || props.fallbackBaseName}_part1_p1-{rangeOf(0)?.end ?? 'n'}.pdf
          </p>
        </div>

        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-slate-600">Download as</legend>
          <div className="grid grid-cols-2 rounded-lg bg-white p-0.5 ring-1 ring-slate-300">
            {(
              [
                ['zip', 'One ZIP file'],
                ['files', 'Separate PDFs'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md py-1.5 text-center text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-500 ${
                  props.delivery === value ? 'bg-indigo-600 font-medium text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="split-delivery"
                  value={value}
                  checked={props.delivery === value}
                  onChange={() => props.onDeliveryChange(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <SplitAction {...props} parts={parts} />
    </div>
  )
}

function SplitInput({
  index,
  value,
  error,
  max,
  onChange,
}: {
  index: number
  value: SplitPoint
  error: string | null
  max: number
  onChange: (v: SplitPoint) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2 py-1.5 pl-3">
      <Scissors className="mt-2.5 size-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="shrink-0 text-sm text-slate-600">
            Split after page
          </label>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={value ?? ''}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-err` : undefined}
            aria-label={`Split ${index + 1}: split after page`}
            onChange={(e) => {
              const t = e.target.value.trim()
              onChange(t === '' ? null : Number(t))
            }}
            className={`${inputClass} w-24 ${
              error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'
            }`}
          />
        </div>
        {error && (
          <p id={`${id}-err`} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertCircle className="size-3.5" aria-hidden /> {error}
          </p>
        )}
      </div>
    </div>
  )
}

function SplitAction(props: PanelProps & { parts: number }) {
  const { status } = props

  if (status.state === 'running') {
    const pct = Math.round(status.percent)
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
            <Loader2 className="size-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
            <span className="truncate">{status.label}…</span>
          </span>
          <span className="tabular-nums text-slate-500">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Split progress">
          <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <button type="button" onClick={props.onCancel} className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    )
  }

  const button = (
    <button
      type="button"
      onClick={props.onSplit}
      disabled={!props.canSplit}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
    >
      <Scissors className="size-5" aria-hidden />
      Split into {props.parts} files
    </button>
  )

  if (status.state !== 'done') {
    return (
      <div className="space-y-2">
        {button}
        {!props.canSplit && <p className="text-center text-xs text-slate-500">Fix the highlighted page numbers to continue.</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-xl p-3 ring-1 ${props.stale ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${props.stale ? 'text-amber-600' : 'text-emerald-600'}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Split into {plural(status.parts.length, 'file')}</p>
            {props.stale && <p className="text-xs font-medium text-amber-700">Settings changed since — split again to update.</p>}
          </div>
          <button type="button" onClick={props.onDismiss} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Dismiss result">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {status.parts.map((p) => (
            <li key={p.url}>
              <a
                href={p.url}
                download={p.name}
                className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={p.name}>{p.name}</span>
                <span className="shrink-0 text-slate-500">{formatBytes(p.size)}</span>
                <Download className="size-3.5 shrink-0 text-slate-400" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a
            href={status.zip.url}
            download={status.zip.name}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <FileArchive className="size-4" aria-hidden /> ZIP · {formatBytes(status.zip.size)}
          </a>
          <button
            type="button"
            onClick={() => props.onDownloadParts(status.parts)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Download className="size-4" aria-hidden /> All PDFs
          </button>
        </div>
      </div>
      {props.stale && button}
    </div>
  )
}
