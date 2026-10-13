import { ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw, RotateCw, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { renderSize } from '../hooks/useThumbnail'
import { PREVIEW_CSS_SIZE } from '../lib/limits'
import { thumbnails } from '../lib/thumbnails'
import type { Segment } from '../lib/types'
import { useWorkspace } from '../state/WorkspaceContext'
import { Thumbnail } from './Thumbnail'

interface Props {
  segment: Segment
  pageId: string
  onNavigate: (pageId: string) => void
  onClose: () => void
}

const iconBtn =
  'flex size-10 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'

/** Full-size view of one page, with quick actions and keyboard navigation inside its card. */
export function PagePreview({ segment, pageId, onNavigate, onClose }: Props) {
  const { dispatch, sources } = useWorkspace()
  const index = segment.pages.findIndex((p) => p.id === pageId)
  const page = segment.pages[index]
  const dialog = useRef<HTMLDivElement>(null)

  // Large previews are expensive; free each one as soon as we navigate away or close.
  useEffect(() => {
    if (!page) return
    const { sourceId, sourceIndex } = page
    return () => thumbnails.evict(sourceId, sourceIndex, renderSize(PREVIEW_CSS_SIZE))
  }, [page?.sourceId, page?.sourceIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!page) onClose()
  }, [page, onClose])
  if (!page) return null

  const go = (delta: number) => {
    const next = segment.pages[index + delta]
    if (next) onNavigate(next.id)
  }
  const rotate = (delta: number) => dispatch({ type: 'rotatePage', segmentId: segment.id, pageId: page.id, delta })
  const toggle = () => dispatch({ type: 'toggleExcluded', segmentId: segment.id, pageId: page.id })

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of page ${page.sourceIndex + 1}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowLeft') go(-1)
        else if (e.key === 'ArrowRight') go(1)
        else if (e.key === 'r' || e.key === 'R') rotate(e.shiftKey ? -90 : 90)
        else if (e.key === 'x' || e.key === 'Delete') toggle()
        else return
        e.preventDefault()
      }}
      className="fixed inset-0 z-40 flex animate-fade-in flex-col bg-slate-950/90 outline-none backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-white sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{segment.name}</p>
          <p className="truncate text-xs text-white/60">
            {index + 1} of {segment.pages.length} · page {page.sourceIndex + 1} of {sources[page.sourceId]?.name}
            {page.excluded && ' · excluded'}
          </p>
        </div>
        <button type="button" onClick={() => rotate(-90)} className={iconBtn} aria-label="Rotate left" title="Rotate left (Shift+R)">
          <RotateCcw className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={() => rotate(90)} className={iconBtn} aria-label="Rotate right" title="Rotate right (R)">
          <RotateCw className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={toggle} className={iconBtn} aria-pressed={page.excluded} aria-label={page.excluded ? 'Include page' : 'Exclude page'} title="Include / exclude (X)">
          {page.excluded ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}
        </button>
        <button type="button" onClick={onClose} className={iconBtn} aria-label="Close preview" title="Close (Esc)">
          <X className="size-6" aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <Thumbnail
          key={`${page.sourceId}:${page.sourceIndex}`}
          sourceId={page.sourceId}
          index={page.sourceIndex}
          rotation={page.rotation}
          cssSize={PREVIEW_CSS_SIZE}
          eager
          className={`aspect-square h-full max-h-full max-w-full ${page.excluded ? 'opacity-40 grayscale' : ''}`}
        />
        <button type="button" onClick={() => go(-1)} disabled={index === 0} className={`${iconBtn} absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 sm:left-4`} aria-label="Previous page">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === segment.pages.length - 1} className={`${iconBtn} absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 sm:right-4`} aria-label="Next page">
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  )
}
