import { sanitizeFileName } from '../../lib/format'
import type { SourceMeta } from '../../lib/types'

export const outputName = (file: SourceMeta, suffix: string) =>
  sanitizeFileName(`${file.name.replace(/\.pdf$/i, '')}_${suffix}`)

export const fieldLabel = 'mb-1 block text-xs font-medium text-slate-600'
export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'

export const SWATCHES = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#6b7280']

/** Font size in container units for text `points` tall on a page `pageWidth` points wide. */
export const cqw = (points: number, pageWidth: number) => `${(points / pageWidth) * 100}cqw`
