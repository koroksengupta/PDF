import { PdfInspectError } from './errors'
import type { WorkerRequest, WorkerResponse } from './pdfWorkerProtocol'
import type { PageRange } from './split'
import type { InspectResult, SplitProgress, StitchPlan, StitchProgress } from './types'

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
  onProgress?: (p: Progress) => void
}

type Progress = StitchProgress | SplitProgress

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * Runs pdf-lib work in a dedicated worker so parsing and merging large files never
 * blocks the UI. Falls back to the main thread if workers are unavailable.
 */
export class PdfWorkerClient {
  private worker: Worker | null = null
  private workerFailed = false
  private nextId = 1
  private pending = new Map<number, Pending>()

  private getWorker(): Worker | null {
    if (this.worker || this.workerFailed) return this.worker
    try {
      const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
        type: 'module',
        name: 'pdf-engine',
      })
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data)
      worker.onerror = (e) => {
        e.preventDefault()
        this.failAll(new Error('The PDF engine crashed. Please try again.'))
      }
      this.worker = worker
    } catch {
      this.workerFailed = true
    }
    return this.worker
  }

  private handle(msg: WorkerResponse) {
    const p = this.pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') {
      p.onProgress?.(msg.progress)
      return
    }
    this.pending.delete(msg.id)
    if (msg.type === 'result') p.resolve(msg.result)
    else p.reject(msg.code ? new PdfInspectError(msg.code, msg.message) : new Error(msg.message))
  }

  private failAll(err: Error) {
    const pending = [...this.pending.values()]
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
    for (const p of pending) p.reject(err)
  }

  private request<T>(
    msg: DistributiveOmit<WorkerRequest, 'id'>,
    onProgress?: (p: Progress) => void,
  ): Promise<T> {
    const worker = this.getWorker()
    if (!worker) return this.runInline<T>(msg, onProgress)
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      // Structured clone copies the buffers, so the caller's bytes stay intact.
      worker.postMessage({ ...msg, id } as WorkerRequest)
    })
  }

  private async runInline<T>(
    msg: DistributiveOmit<WorkerRequest, 'id'>,
    onProgress?: (p: Progress) => void,
  ): Promise<T> {
    const engine = await import('./pdfEngine')
    if (msg.type === 'inspect') return (await engine.inspectPdf(msg.bytes)) as T
    if (msg.type === 'split') return (await engine.splitPdf(msg.bytes, msg.ranges, msg.title, onProgress)) as T
    return (await engine.stitchPdf(msg.plan, onProgress)) as T
  }

  inspect(bytes: ArrayBuffer): Promise<InspectResult> {
    return this.request<InspectResult>({ type: 'inspect', bytes })
  }

  stitch(plan: StitchPlan, onProgress: (p: StitchProgress) => void): Promise<Uint8Array> {
    return this.request<Uint8Array>({ type: 'stitch', plan }, onProgress as (p: Progress) => void)
  }

  split(
    bytes: ArrayBuffer,
    ranges: PageRange[],
    title: string,
    onProgress: (p: SplitProgress) => void,
  ): Promise<Uint8Array[]> {
    return this.request<Uint8Array[]>({ type: 'split', bytes, ranges, title }, onProgress)
  }

  /** Aborts all in-flight work by tearing the worker down; a fresh one starts on demand. */
  cancel() {
    this.failAll(new CancelledError())
  }

  dispose() {
    this.cancel()
  }
}
