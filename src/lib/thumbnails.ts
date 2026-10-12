import type { PDFDocumentProxy } from 'pdfjs-dist'
import { sourceStore } from './sourceStore'

type PdfJs = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJs> | null = null

/** pdf.js is only needed for previews, so it is loaded lazily on first use. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

export type ThumbState = { status: 'ready'; url: string } | { status: 'error' }
type Listener = () => void

interface Job {
  key: string
  sourceId: string
  index: number
  size: number
}

const MAX_CONCURRENT_RENDERS = 2

/**
 * Renders page previews with pdf.js into JPEG object URLs and owns their lifetime:
 * every URL it creates is revoked when its source is released or the service is disposed.
 */
class ThumbnailService {
  private docs = new Map<string, Promise<PDFDocumentProxy>>()
  private cache = new Map<string, ThumbState>()
  private queued = new Map<string, Job>()
  private running = new Set<string>()
  private listeners = new Map<string, Set<Listener>>()
  /** Bumped when a source is released so in-flight renders know to discard their output. */
  private generation = new Map<string, number>()

  static key(sourceId: string, index: number, size: number) {
    return `${sourceId}:${index}@${size}`
  }

  get(sourceId: string, index: number, size: number): ThumbState | undefined {
    return this.cache.get(ThumbnailService.key(sourceId, index, size))
  }

  subscribe(key: string, listener: Listener) {
    let set = this.listeners.get(key)
    if (!set) this.listeners.set(key, (set = new Set()))
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(key)
    }
  }

  /** Queues a render. Most recent requests are served first (they're what's on screen). */
  request(sourceId: string, index: number, size: number) {
    const key = ThumbnailService.key(sourceId, index, size)
    if (this.cache.has(key) || this.running.has(key)) return
    this.queued.delete(key)
    this.queued.set(key, { key, sourceId, index, size })
    this.pump()
  }

  /** Drops a queued (not yet started) render, e.g. when the thumbnail scrolls out of view. */
  cancel(sourceId: string, index: number, size: number) {
    this.queued.delete(ThumbnailService.key(sourceId, index, size))
  }

  private pump() {
    while (this.running.size < MAX_CONCURRENT_RENDERS && this.queued.size > 0) {
      const job = [...this.queued.values()].pop()!
      this.queued.delete(job.key)
      this.running.add(job.key)
      void this.render(job).finally(() => {
        this.running.delete(job.key)
        this.pump()
      })
    }
  }

  private getDoc(sourceId: string): Promise<PDFDocumentProxy> {
    let doc = this.docs.get(sourceId)
    if (!doc) {
      const bytes = sourceStore.get(sourceId)
      if (!bytes) return Promise.reject(new Error('Source released'))
      doc = loadPdfJs().then(
        (pdfjs) =>
          // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
          pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false })
            .promise,
      )
      // Don't keep a rejected promise around; a later request may retry.
      doc.catch(() => this.docs.delete(sourceId))
      this.docs.set(sourceId, doc)
    }
    return doc
  }

  private async render(job: Job) {
    const gen = this.generation.get(job.sourceId) ?? 0
    let state: ThumbState
    const canvas = document.createElement('canvas')
    try {
      const doc = await this.getDoc(job.sourceId)
      const page = await doc.getPage(job.index + 1)
      const base = page.getViewport({ scale: 1 })
      const scale = job.size / Math.max(base.width, base.height)
      const viewport = page.getViewport({ scale })
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('Canvas unavailable')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise
      page.cleanup()
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      )
      if (!blob) throw new Error('Encoding failed')
      state = { status: 'ready', url: URL.createObjectURL(blob) }
    } catch {
      state = { status: 'error' }
    } finally {
      // Release the backing store right away; large canvases add up quickly.
      canvas.width = 0
      canvas.height = 0
    }

    if ((this.generation.get(job.sourceId) ?? 0) !== gen || !sourceStore.get(job.sourceId)) {
      if (state.status === 'ready') URL.revokeObjectURL(state.url)
      return
    }
    this.cache.set(job.key, state)
    this.listeners.get(job.key)?.forEach((l) => l())
  }

  /** Revokes a single preview, e.g. the large one shown in the page viewer. */
  evict(sourceId: string, index: number, size: number) {
    const key = ThumbnailService.key(sourceId, index, size)
    const state = this.cache.get(key)
    if (state?.status === 'ready') URL.revokeObjectURL(state.url)
    this.cache.delete(key)
  }

  /** Frees everything tied to a source: object URLs, queued jobs and the pdf.js document. */
  releaseSource(sourceId: string) {
    this.generation.set(sourceId, (this.generation.get(sourceId) ?? 0) + 1)
    const prefix = `${sourceId}:`
    for (const [key, state] of this.cache) {
      if (!key.startsWith(prefix)) continue
      if (state.status === 'ready') URL.revokeObjectURL(state.url)
      this.cache.delete(key)
    }
    for (const key of this.queued.keys()) if (key.startsWith(prefix)) this.queued.delete(key)
    const doc = this.docs.get(sourceId)
    this.docs.delete(sourceId)
    doc?.then((d) => d.destroy()).catch(() => {})
  }

  releaseAll() {
    for (const id of new Set([...this.docs.keys(), ...this.generation.keys()])) {
      this.releaseSource(id)
    }
    for (const [key, state] of this.cache) {
      if (state.status === 'ready') URL.revokeObjectURL(state.url)
      this.cache.delete(key)
    }
    this.queued.clear()
  }

  /** Number of live object URLs; exposed for diagnostics and tests. */
  liveUrlCount() {
    let n = 0
    for (const s of this.cache.values()) if (s.status === 'ready') n++
    return n
  }
}

export const thumbnails = new ThumbnailService()
export { ThumbnailService }
