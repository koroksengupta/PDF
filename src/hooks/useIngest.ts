import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { formatBytes, plural } from '../lib/format'
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES } from '../lib/limits'
import { PdfInspectError } from '../lib/errors'
import { PdfWorkerClient } from '../lib/pdfWorkerClient'
import { sourceStore } from '../lib/sourceStore'
import type { SourceMeta } from '../lib/types'
import { uid, type WorkspaceAction } from '../state/workspace'
import { useToasts } from './useToasts'

export interface PendingFile {
  key: string
  name: string
  size: number
}

const looksLikePdf = (file: File) =>
  file.type === 'application/pdf' ||
  file.type === 'application/x-pdf' ||
  /\.pdf$/i.test(file.name) ||
  // Some platforms report no MIME type at all; the header check decides.
  (file.type === '' && !/\.[a-z0-9]{1,5}$/i.test(file.name))

const INSPECT_TITLES: Record<PdfInspectError['code'], string> = {
  'not-pdf': 'Not a PDF',
  encrypted: 'Password-protected PDF',
  corrupt: 'Corrupted PDF',
  empty: 'Empty PDF',
}

/** Validates and loads dropped/picked files, one at a time, in the order given. */
export function useIngest(dispatch: Dispatch<WorkspaceAction>) {
  const { push } = useToasts()
  const client = useMemo(() => new PdfWorkerClient(), [])
  const [pending, setPending] = useState<PendingFile[]>([])
  const chain = useRef<Promise<void>>(Promise.resolve())
  const disposed = useRef(false)
  // Bytes accepted but whose card may not be rendered yet still count toward the cap.
  const reserved = useRef(0)

  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
      client.dispose()
    }
  }, [client])

  const processFile = useCallback(
    async (file: File): Promise<SourceMeta | null> => {
      const fail = (title: string, description: string, kind: 'error' | 'warning' = 'error') => {
        push({ kind, title, description })
        return null
      }
      if (!looksLikePdf(file)) {
        return fail('Skipped a non-PDF file', `“${file.name}” is not a PDF.`, 'warning')
      }
      if (file.size === 0) return fail(INSPECT_TITLES.empty, `“${file.name}” is empty.`)
      if (file.size > MAX_FILE_BYTES) {
        return fail(
          'File too large',
          `“${file.name}” is ${formatBytes(file.size)}. The limit per file is ${formatBytes(MAX_FILE_BYTES)}.`,
        )
      }
      if (sourceStore.totalBytes() + reserved.current + file.size > MAX_TOTAL_BYTES) {
        return fail(
          'Workspace is full',
          `Adding “${file.name}” would exceed ${formatBytes(MAX_TOTAL_BYTES)} in total. Remove some files first.`,
        )
      }

      reserved.current += file.size
      try {
        let bytes: ArrayBuffer
        try {
          bytes = await file.arrayBuffer()
        } catch {
          return fail('Could not read file', `The browser could not read “${file.name}”.`)
        }
        const { pageCount } = await client.inspect(bytes)
        if (disposed.current) return null
        const meta: SourceMeta = { id: uid('src'), name: file.name, size: file.size, pageCount }
        sourceStore.set(meta.id, bytes)
        return meta
      } catch (err) {
        if (disposed.current) return null
        if (err instanceof PdfInspectError) {
          return fail(INSPECT_TITLES[err.code], `“${file.name}”: ${err.message}`)
        }
        return fail('Could not open PDF', `“${file.name}”: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        reserved.current -= file.size
      }
    },
    [client, push],
  )

  const ingest = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
      if (files.length === 0) return
      const items = files.map((f) => ({ key: uid('pending'), name: f.name, size: f.size }))
      setPending((list) => [...list, ...items])

      chain.current = chain.current.then(async () => {
        let added = 0
        let pages = 0
        for (let i = 0; i < files.length; i++) {
          if (disposed.current) return
          let meta: SourceMeta | null = null
          try {
            meta = await processFile(files[i])
          } finally {
            // Every exit path (including early rejections) must clear the pending row.
            setPending((list) => list.filter((p) => p.key !== items[i].key))
          }
          if (meta) {
            // Store write and dispatch happen in the same tick (see App's release effect).
            dispatch({ type: 'addSources', sources: [meta] })
            added++
            pages += meta.pageCount
          }
        }
        if (added > 0 && files.length > 1) {
          push({
            kind: 'success',
            title: `Added ${plural(added, 'file')}`,
            description: `${plural(pages, 'page')} ready to arrange.`,
          })
        }
      })
      // Keep the queue alive for later drops even if something unexpected escapes.
      chain.current = chain.current.catch((err) => {
        console.error(err)
        push({ kind: 'error', title: 'Could not add files', description: 'An unexpected error occurred.' })
      })
    },
    [dispatch, processFile, push],
  )

  return { ingest, pending }
}
