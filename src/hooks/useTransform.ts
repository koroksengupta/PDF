import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { triggerDownload } from '../lib/dom'
import type { TransformOp } from '../lib/editTypes'
import { CancelledError, PdfWorkerClient } from '../lib/pdfWorkerClient'
import { sourceStore } from '../lib/sourceStore'
import { useToasts } from './useToasts'

export type TransformStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; url: string; fileName: string; size: number; blob: Blob; signature: string }

/** Runs one edit on a file in the worker, downloads the result and keeps it for re-use. */
export function useTransform(successTitle: string) {
  const { push } = useToasts()
  const client = useMemo(() => new PdfWorkerClient(), [])
  const [status, setStatus] = useState<TransformStatus>({ state: 'idle' })
  const url = useRef<string | null>(null)

  const revoke = useCallback(() => {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = null
  }, [])
  useEffect(
    () => () => {
      client.dispose()
      revoke()
    },
    [client, revoke],
  )

  const run = useCallback(
    async (sourceId: string, op: TransformOp, fileName: string, signature: string) => {
      revoke()
      setStatus({ state: 'running' })
      try {
        const bytes = sourceStore.get(sourceId)
        if (!bytes) throw new Error('The file is no longer available. Please add it again.')
        const out = await client.transform(bytes, op)
        const blob = new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
        url.current = URL.createObjectURL(blob)
        setStatus({ state: 'done', url: url.current, fileName, size: blob.size, blob, signature })
        triggerDownload(url.current, fileName)
        push({ kind: 'success', title: successTitle, description: `${fileName} is downloading.` })
      } catch (err) {
        setStatus({ state: 'idle' })
        if (err instanceof CancelledError) push({ kind: 'info', title: 'Cancelled' })
        else
          push({
            kind: 'error',
            title: 'Could not create the PDF',
            description: err instanceof Error ? err.message : 'An unexpected error occurred.',
          })
      }
    },
    [client, push, revoke, successTitle],
  )

  const dismiss = useCallback(() => {
    revoke()
    setStatus({ state: 'idle' })
  }, [revoke])

  return { status, run, cancel: () => client.cancel(), dismiss, client }
}
