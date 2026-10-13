import { CheckCircle2, Download, ExternalLink, Layers, Loader2, X } from 'lucide-react'
import type { StitchStatus } from '../hooks/useStitch'
import { formatBytes, plural } from '../lib/format'

interface Props {
  status: StitchStatus
  disabledReason: string | null
  stale: boolean
  outputPages: number
  onStitch: () => void
  onCancel: () => void
  onDownloadAgain: () => void
  onDismiss: () => void
  variant: 'panel' | 'bar'
}

export function StitchAction({
  status,
  disabledReason,
  stale,
  outputPages,
  onStitch,
  onCancel,
  onDownloadAgain,
  onDismiss,
  variant,
}: Props) {
  if (status.state === 'running') {
    const pct = Math.round(status.percent)
    const indeterminate = status.percent >= 90 && status.percent < 100
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
            <Loader2 className="size-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
            <span className="truncate">{status.label}…</span>
          </span>
          <span className="tabular-nums text-slate-500">{pct}%</span>
        </div>
        <div
          className="relative h-2.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Merge progress"
        >
          <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${pct}%` }} />
          {indeterminate && (
            <div className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    )
  }

  const stitchButton = (
    <button
      type="button"
      onClick={onStitch}
      disabled={disabledReason !== null}
      title={disabledReason ?? undefined}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
    >
      <Layers className="size-5" aria-hidden />
      Merge PDFs
      {outputPages > 0 && variant === 'panel' && (
        <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-medium">{plural(outputPages, 'page')}</span>
      )}
    </button>
  )

  if (status.state === 'done') {
    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-3 ring-1 ${stale ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${stale ? 'text-amber-600' : 'text-emerald-600'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900" title={status.fileName}>{status.fileName}</p>
              <p className="text-xs text-slate-600">
                {plural(status.pages, 'page')} · {formatBytes(status.size)}
              </p>
              {stale && <p className="mt-1 text-xs font-medium text-amber-700">Workspace changed since — stitch again to update.</p>}
            </div>
            <button type="button" onClick={onDismiss} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Dismiss result">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDownloadAgain}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Download className="size-4" aria-hidden /> Download
            </button>
            <a
              href={status.url}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <ExternalLink className="size-4" aria-hidden /> Open
            </a>
          </div>
        </div>
        {stale && stitchButton}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {stitchButton}
      {disabledReason && variant === 'panel' && <p className="text-center text-xs text-slate-500">{disabledReason}</p>}
    </div>
  )
}
