/// <reference lib="webworker" />
import { PdfInspectError, inspectPdf, stitchPdf } from '../lib/pdfEngine'
import type { WorkerRequest, WorkerResponse } from '../lib/pdfWorkerProtocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer)

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'inspect') {
      post({ id: msg.id, type: 'result', result: await inspectPdf(msg.bytes) })
    } else {
      const bytes = await stitchPdf(msg.plan, (progress) =>
        post({ id: msg.id, type: 'progress', progress }),
      )
      post({ id: msg.id, type: 'result', result: bytes }, [bytes.buffer])
    }
  } catch (err) {
    post({
      id: msg.id,
      type: 'error',
      code: err instanceof PdfInspectError ? err.code : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
