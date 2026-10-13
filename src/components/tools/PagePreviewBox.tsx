import type { ReactNode } from 'react'
import { Thumbnail } from '../Thumbnail'

/**
 * A page thumbnail at the page's true aspect ratio, with an overlay whose children are
 * positioned in percentages. The box is a size container, so `cqw` units scale with it.
 */
export function PagePreviewBox({
  sourceId,
  index,
  size,
  children,
  className = '',
  cssSize = 320,
}: {
  sourceId: string
  index: number
  size?: { width: number; height: number }
  children?: ReactNode
  className?: string
  cssSize?: number
}) {
  const ratio = size ? size.width / size.height : 1 / 1.414
  return (
    <div
      className={`relative overflow-hidden bg-white shadow-md ring-1 ring-slate-200 ${className}`}
      style={{ aspectRatio: String(ratio), containerType: 'inline-size' }}
    >
      <Thumbnail sourceId={sourceId} index={index} rotation={0} cssSize={cssSize} className="absolute inset-0 size-full" />
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  )
}
