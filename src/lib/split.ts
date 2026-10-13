/**
 * Split points are 1-based page numbers meaning "split after this page".
 * N parts need N − 1 strictly increasing points in [1, pageCount − 1].
 */
export type SplitPoint = number | null

export interface PageRange {
  /** 1-based, inclusive. */
  start: number
  end: number
}

export const MAX_PARTS = 200

export const maxParts = (pageCount: number) => Math.max(1, Math.min(pageCount, MAX_PARTS))

/** Evenly spaced split points for `parts` parts (earlier parts get the extra page when uneven). */
export function evenSplitPoints(pageCount: number, parts: number): number[] {
  const n = Math.min(Math.max(1, Math.trunc(parts)), maxParts(pageCount))
  return Array.from({ length: n - 1 }, (_, i) => Math.ceil(((i + 1) * pageCount) / n))
}

export interface SplitValidation {
  errors: (string | null)[]
  valid: boolean
}

export function validateSplitPoints(points: SplitPoint[], pageCount: number): SplitValidation {
  let previous = 0
  const errors = points.map((p) => {
    if (p === null || !Number.isFinite(p)) return 'Enter a page number'
    if (!Number.isInteger(p) || p < 1 || p > pageCount - 1) {
      return pageCount > 1 ? `Must be between 1 and ${pageCount - 1}` : 'This file has only one page'
    }
    if (p <= previous) return `Must be after page ${previous}`
    previous = p
    return null
  })
  return { errors, valid: points.length > 0 && errors.every((e) => e === null) }
}

/** Ranges for valid split points. Call only when validateSplitPoints says valid. */
export function pointsToRanges(points: number[], pageCount: number): PageRange[] {
  const bounds = [0, ...points, pageCount]
  return bounds.slice(1).map((end, i) => ({ start: bounds[i] + 1, end }))
}

/** Adds the split after `page`, or removes it if present. Unfilled inputs are dropped. */
export function toggleSplitPoint(points: SplitPoint[], page: number): number[] {
  const set = new Set(points.filter((p): p is number => p !== null))
  if (set.has(page)) set.delete(page)
  else set.add(page)
  return [...set].sort((a, b) => a - b)
}

export function partFileName(base: string, index: number, total: number, range: PageRange): string {
  const n = String(index + 1).padStart(String(total).length, '0')
  const pages = range.start === range.end ? `p${range.start}` : `p${range.start}-${range.end}`
  return `${base}_part${n}_${pages}.pdf`
}
