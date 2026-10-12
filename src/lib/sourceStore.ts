/**
 * Raw bytes of ingested PDFs. Kept outside React state so large buffers are never
 * diffed, cloned into history, or serialised by dev tools.
 */
const bytesById = new Map<string, ArrayBuffer>()

export const sourceStore = {
  set(id: string, bytes: ArrayBuffer) {
    bytesById.set(id, bytes)
  },
  get(id: string) {
    return bytesById.get(id)
  },
  delete(id: string) {
    bytesById.delete(id)
  },
  ids() {
    return [...bytesById.keys()]
  },
  totalBytes() {
    let total = 0
    for (const b of bytesById.values()) total += b.byteLength
    return total
  },
}
