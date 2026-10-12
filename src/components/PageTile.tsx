import { Draggable } from '@hello-pangea/dnd'
import { Eye, EyeOff, Maximize2, RotateCcw, RotateCw } from 'lucide-react'
import { memo } from 'react'
import { THUMB_CSS_SIZE } from '../lib/limits'
import type { PageRef } from '../lib/types'
import { useWorkspace } from '../state/WorkspaceContext'
import { Thumbnail } from './Thumbnail'

interface Props {
  page: PageRef
  index: number
  segmentId: string
  /** Shown when a card mixes pages from several files. */
  sourceLabel?: string
}

const actionBtn =
  'flex size-7 items-center justify-center rounded-md text-white/90 hover:bg-white/20 hover:text-white focus-visible:outline-white'

export const PageTile = memo(function PageTile({ page, index, segmentId, sourceLabel }: Props) {
  const { dispatch, openPreview } = useWorkspace()
  const rotate = (delta: number) =>
    dispatch({ type: 'rotatePage', segmentId, pageId: page.id, delta })

  return (
    <Draggable draggableId={page.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          aria-label={`Page ${page.sourceIndex + 1}${page.excluded ? ', excluded' : ''}${page.rotation ? `, rotated ${page.rotation}°` : ''}. Drag to reorder.`}
          className="group mr-3 w-[8.75rem] shrink-0 select-none outline-none"
          data-page-tile
        >
          <div
            className={`relative aspect-square overflow-hidden rounded-xl border bg-slate-100 p-2 transition-shadow ${
              snapshot.isDragging
                ? 'border-indigo-400 shadow-xl ring-2 ring-indigo-300'
                : 'border-slate-200 group-hover:border-slate-300 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-indigo-500'
            }`}
          >
            <Thumbnail
              sourceId={page.sourceId}
              index={page.sourceIndex}
              rotation={page.rotation}
              cssSize={THUMB_CSS_SIZE}
              className={`size-full transition ${page.excluded ? 'opacity-30 grayscale' : ''}`}
            />

            {page.excluded && (
              <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-slate-800/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                Excluded
              </span>
            )}
            {page.rotation !== 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                {page.rotation}°
              </span>
            )}

            {/* Quick actions: revealed on hover/focus, always visible on touch screens. */}
            <div
              className={`absolute inset-x-1.5 bottom-1.5 flex items-center justify-between rounded-lg bg-slate-900/80 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100 ${
                snapshot.isDragging ? '!opacity-0' : ''
              }`}
            >
              <button type="button" className={actionBtn} onClick={() => rotate(-90)} aria-label="Rotate page left" title="Rotate left">
                <RotateCcw className="size-4" aria-hidden />
              </button>
              <button type="button" className={actionBtn} onClick={() => rotate(90)} aria-label="Rotate page right" title="Rotate right">
                <RotateCw className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={actionBtn}
                onClick={() => openPreview(segmentId, page.id)}
                aria-label="Preview page"
                title="Preview"
              >
                <Maximize2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={actionBtn}
                onClick={() => dispatch({ type: 'toggleExcluded', segmentId, pageId: page.id })}
                aria-label={page.excluded ? 'Include page' : 'Exclude page'}
                aria-pressed={page.excluded}
                title={page.excluded ? 'Include in output' : 'Exclude from output'}
              >
                {page.excluded ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-1 px-0.5 text-xs">
            <span className={`font-medium ${page.excluded ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              Page {page.sourceIndex + 1}
            </span>
            {sourceLabel && (
              <span className="truncate text-[10px] text-slate-400" title={sourceLabel}>
                {sourceLabel}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
})
