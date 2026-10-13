/**
 * Raw bytes of ingested PDFs. Kept outside React state so large buffers are never
 * diffed, cloned into history, or serialised by dev tools.
 *
 * Several parts of the app can use the same file (the upload list, the merge
 * workspace and its undo history, the split tool), so each one *retains* the ids it
 * uses and *releases* them when done. Bytes are freed once nobody holds them.
 */
export type SourceOwner = 'library' | 'stitch' | 'split'

const bytesById = new Map<string, ArrayBuffer>()
const owners = new Map<string, Set<SourceOwner>>()
const freeListeners = new Set<(id: string) => void>()

function free(id: string) {
  bytesById.delete(id)
  owners.delete(id)
  freeListeners.forEach((l) => l(id))
}

export const sourceStore = {
  set(id: string, bytes: ArrayBuffer) {
    bytesById.set(id, bytes)
  },
  get(id: string) {
    return bytesById.get(id)
  },
  retain(id: string, owner: SourceOwner) {
    if (!bytesById.has(id)) return
    let set = owners.get(id)
    if (!set) owners.set(id, (set = new Set()))
    set.add(owner)
  },
  release(id: string, owner: SourceOwner) {
    const set = owners.get(id)
    if (!set) return
    set.delete(owner)
    if (set.size === 0) free(id)
  },
  /** Called with each id whose bytes were freed (e.g. to drop its thumbnails). */
  onFree(listener: (id: string) => void) {
    freeListeners.add(listener)
    return () => {
      freeListeners.delete(listener)
    }
  },
  has(id: string) {
    return bytesById.has(id)
  },
  totalBytes() {
    let total = 0
    for (const b of bytesById.values()) total += b.byteLength
    return total
  },
}
