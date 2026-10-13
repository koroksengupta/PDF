import type { DragEvent as ReactDragEvent } from 'react'

/** True for drags that carry files from the OS (as opposed to in-page drag and drop). */
export const hasFiles = (e: ReactDragEvent | DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files')

/** Saves a blob URL under the given name without navigating away. */
export function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
