import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { triggerDownload } from '../lib/dom'
import { CancelledError, PdfWorkerClient } from '../lib/pdfWorkerClient'
import { sourceStore } from '../lib/sourceStore'
import { partFileName, type PageRange } from '../lib/split'
import { useToasts } from './useToasts'

export type SplitDelivery = 'zip' | 'files'

export interface SplitPartResult {
  name: string
  url: string
  size: number
  range: PageRange
}

export type SplitStatus =
  | { state: 'idle' }
  | { state: 'running'; percent: number; label: string }
  | {
      state: 'done'
      parts: SplitPartResult[]
      zip: { name: string; url: string; size: number }
      signature: string
    }

export interface SplitRequest {
  sourceId: string
  ranges: PageRange[]
  baseName: string
  delivery: SplitDelivery
  signature: string
}

/** Gap between consecutive downloads; browsers drop bursts of programmatic downloads. */
const DOWNLOAD_GAP_MS = 350

export function useSplit() {
  const { push } = useToasts()
  const client = useMemo(() => new PdfWorkerClient(), [])
  const [status, setStatus] = useState<SplitStatus>({ state: 'idle' })
  const urls = useRef<string[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const revoke = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
  }, [])

  useEffect(
    () => () => {
      client.dispose()
      revoke()
    },
    [client, revoke],
  )

  const downloadParts = useCallback((parts: SplitPartResult[]) => {
    parts.forEach((p, i) => {
      timers.current.push(setTimeout(() => triggerDownload(p.url, p.name), i * DOWNLOAD_GAP_MS))
    })
  }, [])

  const split = useCallback(
    async (req: SplitRequest) => {
      revoke()
      setStatus({ state: 'running', percent: 0, label: 'Reading file' })
      try {
        const bytes = sourceStore.get(req.sourceId)
        if (!bytes) throw new Error('The file is no longer available. Please add it again.')
        const total = req.ranges.length
        const parts = await client.split(bytes, req.ranges, req.baseName, (p) =>
          setStatus((s) =>
            s.state === 'running'
              ? {
                  state: 'running',
                  // Leave the last 10% for packaging.
                  percent: (p.done / Math.max(1, p.total)) * 90,
                  label: p.done < p.total ? `Creating part ${p.done + 1} of ${total}` : 'Packaging',
                }
              : s,
          ),
        )

        const results: SplitPartResult[] = parts.map((bytes, i) => {
          const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          urls.current.push(url)
          return { name: partFileName(req.baseName, i, total, req.ranges[i]), url, size: blob.size, range: req.ranges[i] }
        })

        // PDFs are already compressed, so store them uncompressed: fast and no bigger.
        const { zipSync } = await import('fflate')
        const zipped = zipSync(
          Object.fromEntries(parts.map((bytes, i) => [results[i].name, [bytes, { level: 0 }]])),
        )
        const zipBlob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
        const zip = { name: `${req.baseName}_split.zip`, url: URL.createObjectURL(zipBlob), size: zipBlob.size }
        urls.current.push(zip.url)

        setStatus({ state: 'done', parts: results, zip, signature: req.signature })
        if (req.delivery === 'zip') triggerDownload(zip.url, zip.name)
        else downloadParts(results)
        push({
          kind: 'success',
          title: `Split into ${total} files`,
          description:
            req.delivery === 'zip'
              ? `${zip.name} is downloading.`
              : 'Your browser may ask permission to download multiple files.',
        })
      } catch (err) {
        revoke()
        setStatus({ state: 'idle' })
        if (err instanceof CancelledError) push({ kind: 'info', title: 'Split cancelled' })
        else
          push({
            kind: 'error',
            title: 'Split failed',
            description: err instanceof Error ? err.message : 'An unexpected error occurred.',
          })
      }
    },
    [client, downloadParts, push, revoke],
  )

  const cancel = useCallback(() => client.cancel(), [client])
  const dismiss = useCallback(() => {
    revoke()
    setStatus({ state: 'idle' })
  }, [revoke])

  return { status, split, cancel, dismiss, downloadParts }
}
