import { UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasFiles } from '../lib/dom'

/** Accepts files dropped anywhere on the page and shows a full-screen hint while dragging. */
export function FileDropOverlay({ onFiles, label }: { onFiles: (files: FileList) => void; label: string }) {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const reset = () => {
      depth = 0
      setDragging(false)
    }
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault() // otherwise the browser opens the PDF itself
    }
    // Capture phase: runs before any drop zone can stop the event, so the overlay
    // always clears, however the drop is handled.
    const dropCapture = (e: DragEvent) => {
      if (hasFiles(e)) reset()
    }
    // Bubble phase: only take files no drop zone has already handled.
    const drop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files)
    }
    // Safety net for cancelled drags (Esc, or leaving the window, where browsers
    // don't always send a final dragleave): pointer events resume only after a drag ends.
    const pointerMove = () => {
      if (depth > 0) reset()
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', dropCapture, true)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', reset)
    window.addEventListener('pointermove', pointerMove)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', dropCapture, true)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('pointermove', pointerMove)
    }
  }, [onFiles])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-indigo-600/10 p-6 backdrop-blur-[2px]">
      <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-indigo-500 bg-white/95 px-12 py-10 text-center shadow-2xl">
        <UploadCloud className="size-10 text-indigo-600" aria-hidden />
        <p className="mt-3 text-lg font-semibold text-slate-900">{label}</p>
      </div>
    </div>
  )
}
