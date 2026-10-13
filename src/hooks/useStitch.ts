import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CancelledError, PdfWorkerClient } from '../lib/pdfWorkerClient'
import { triggerDownload } from '../lib/dom'
import { sourceStore } from '../lib/sourceStore'
import type { Segment, StitchOptions, StitchPlan, StitchProgress } from '../lib/types'
import { useToasts } from './useToasts'

export type StitchStatus =
  | { state: 'idle' }
  | { state: 'running'; percent: number; label: string }
  | { state: 'done'; url: string; fileName: string; size: number; pages: number; signature: string }

const PHASE_LABEL: Record<StitchProgress['phase'], string> = {
  loading: 'Reading source files',
  copying: 'Assembling pages',
  numbering: 'Adding page numbers',
  saving: 'Compressing & finalising',
}

/** Maps engine progress onto one 0–100 bar. */
function overallPercent(p: StitchProgress, numbering: boolean): number {
  const frac = p.total > 0 ? p.done / p.total : 0
  const copyEnd = numbering ? 75 : 88
  switch (p.phase) {
    case 'loading':
      return frac * 20
    case 'copying':
      return 20 + frac * (copyEnd - 20)
    case 'numbering':
      return 75 + frac * 13
    case 'saving':
      return frac >= 1 ? 100 : 90
  }
}

/** Identifies the content that would be stitched, to tell when a result is out of date. */
export function stitchSignature(segments: Segment[], options: StitchOptions, fileName: string) {
  return JSON.stringify([
    fileName,
    options,
    segments.map((s) => s.pages.map((p) => (p.excluded ? 0 : `${p.id}/${p.rotation}`))),
  ])
}

export function buildPlan(segments: Segment[], options: StitchOptions): StitchPlan {
  const groups = segments.map((s) =>
    s.pages
      .filter((p) => !p.excluded)
      .map((p) => ({ sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: p.rotation })),
  )
  const ids = new Set(groups.flat().map((p) => p.sourceId))
  const sources = [...ids].map((id) => {
    const bytes = sourceStore.get(id)
    if (!bytes) throw new Error('A file is no longer available. Please re-add it.')
    return { id, bytes }
  })
  return { sources, segments: groups, options }
}

export function useStitch() {
  const { push } = useToasts()
  const client = useMemo(() => new PdfWorkerClient(), [])
  const [status, setStatus] = useState<StitchStatus>({ state: 'idle' })
  const resultUrl = useRef<string | null>(null)
  const frame = useRef(0)

  const revokeResult = useCallback(() => {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current)
    resultUrl.current = null
  }, [])

  useEffect(
    () => () => {
      client.dispose()
      cancelAnimationFrame(frame.current)
      revokeResult()
    },
    [client, revokeResult],
  )

  const stitch = useCallback(
    async (segments: Segment[], options: StitchOptions, fileName: string) => {
      revokeResult()
      setStatus({ state: 'running', percent: 0, label: 'Preparing' })
      const signature = stitchSignature(segments, options, fileName)
      try {
        const plan = buildPlan(segments, options)
        const nonEmpty = plan.segments.filter((s) => s.length > 0)
        const separators = options.separatorPages ? Math.max(0, nonEmpty.length - 1) : 0
        const pages = nonEmpty.reduce((n, s) => n + s.length, 0) + separators
        let latest: StitchProgress | null = null
        const bytes = await client.stitch(plan, (p) => {
          latest = p
          // Coalesce bursts of per-page events into one render per frame.
          if (frame.current) return
          frame.current = requestAnimationFrame(() => {
            frame.current = 0
            const p = latest!
            setStatus((s) =>
              s.state === 'running'
                ? { state: 'running', percent: overallPercent(p, options.pageNumbers.enabled), label: PHASE_LABEL[p.phase] }
                : s,
            )
          })
        })
        cancelAnimationFrame(frame.current)
        frame.current = 0
        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        resultUrl.current = url
        setStatus({ state: 'done', url, fileName, size: blob.size, pages, signature })
        triggerDownload(url, fileName)
        push({ kind: 'success', title: 'PDFs merged', description: `${fileName} is downloading.` })
      } catch (err) {
        cancelAnimationFrame(frame.current)
        frame.current = 0
        setStatus({ state: 'idle' })
        if (err instanceof CancelledError) {
          push({ kind: 'info', title: 'Merge cancelled' })
        } else {
          push({
            kind: 'error',
            title: 'Merge failed',
            description: err instanceof Error ? err.message : 'An unexpected error occurred.',
          })
        }
      }
    },
    [client, push, revokeResult],
  )

  const cancel = useCallback(() => client.cancel(), [client])

  const dismiss = useCallback(() => {
    revokeResult()
    setStatus({ state: 'idle' })
  }, [revokeResult])

  const downloadAgain = useCallback(() => {
    if (status.state === 'done') triggerDownload(status.url, status.fileName)
  }, [status])

  return { status, stitch, cancel, dismiss, downloadAgain }
}
