import { FilePlus2, Loader2, ShieldCheck, UploadCloud } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { PendingFile } from '../hooks/useIngest'
import { hasFiles } from '../lib/dom'
import { formatBytes } from '../lib/format'
import { MAX_FILE_BYTES } from '../lib/limits'

interface Props {
  onFiles: (files: FileList | File[]) => void
  pending: PendingFile[]
  compact: boolean
}

export function DropZone({ onFiles, pending, compact }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const browse = () => input.current?.click()

  const handlers = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      setOver(false)
      onFiles(e.dataTransfer.files)
    },
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="application/pdf,.pdf"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        if (e.target.files) onFiles(e.target.files)
        e.target.value = '' // allow re-selecting the same file
      }}
    />
  )

  const pendingList = pending.length > 0 && (
    <ul className="mt-3 space-y-1.5" aria-live="polite">
      {pending.map((p) => (
        <li key={p.key} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
          <Loader2 className="size-4 shrink-0 animate-spin text-indigo-500" aria-hidden />
          <span className="truncate">Reading {p.name}</span>
          <span className="ml-auto shrink-0 text-xs text-slate-400">{formatBytes(p.size)}</span>
        </li>
      ))}
    </ul>
  )

  if (compact) {
    return (
      <div>
        <div
          {...handlers}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition-colors sm:flex-row ${
            over ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white/60'
          }`}
        >
          <UploadCloud className="hidden size-5 text-slate-400 sm:block" aria-hidden />
          <p className="text-sm text-slate-600">Drop more PDFs here, or</p>
          <button
            type="button"
            onClick={browse}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm ring-1 ring-slate-200 hover:bg-indigo-50"
          >
            <FilePlus2 className="size-4" aria-hidden /> Add files
          </button>
          {fileInput}
        </div>
        {pendingList}
      </div>
    )
  }

  return (
    <div>
      <div
        {...handlers}
        role="button"
        tabIndex={0}
        onClick={browse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            browse()
          }
        }}
        aria-label="Upload PDF files"
        className={`flex cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors sm:py-20 ${
          over ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
        }`}
      >
        <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <UploadCloud className="size-8" aria-hidden />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-900 sm:text-xl">Drop PDFs here to start stitching</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          or <span className="font-medium text-indigo-600 underline underline-offset-2">browse your device</span> — select as many files as you like
        </p>
        <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="size-3.5" aria-hidden /> Files are processed on this device and never uploaded
        </p>
        <p className="mt-2 text-xs text-slate-400">Up to {formatBytes(MAX_FILE_BYTES)} per file</p>
      </div>
      {/* Kept outside the clickable area so the input's own click doesn't bubble back into browse(). */}
      {fileInput}
      {pendingList}
    </div>
  )
}
