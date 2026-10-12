import { FileWarning } from 'lucide-react'
import { memo, useRef } from 'react'
import { useInView } from '../hooks/useInView'
import { useThumbnail } from '../hooks/useThumbnail'
import type { Rotation } from '../lib/types'

interface Props {
  sourceId: string
  index: number
  rotation: Rotation
  cssSize: number
  /** Render immediately instead of waiting to scroll into view. */
  eager?: boolean
  className?: string
}

/** A lazily rendered page preview. User rotation is applied with CSS so it never re-renders. */
export const Thumbnail = memo(function Thumbnail({
  sourceId,
  index,
  rotation,
  cssSize,
  eager = false,
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const thumb = useThumbnail(sourceId, index, cssSize, eager || inView)

  return (
    <div ref={ref} className={`relative flex items-center justify-center ${className}`}>
      {thumb?.status === 'ready' ? (
        <img
          src={thumb.url}
          alt={`Page ${index + 1}`}
          draggable={false}
          decoding="async"
          className="size-full object-contain drop-shadow-sm transition-transform duration-200 ease-out"
          style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
        />
      ) : thumb?.status === 'error' ? (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <FileWarning className="size-6" aria-hidden />
          <span className="text-[10px] font-medium">No preview</span>
        </div>
      ) : (
        <div className="size-3/4 animate-pulse rounded bg-slate-200" aria-label="Loading preview" />
      )}
    </div>
  )
})
