import type { DragEvent as ReactDragEvent } from 'react'

/** True for drags that carry files from the OS (as opposed to in-page drag and drop). */
export const hasFiles = (e: ReactDragEvent | DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files')
