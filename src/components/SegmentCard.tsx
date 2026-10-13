import { Draggable, Droppable } from '@hello-pangea/dnd'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Pencil,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { formatBytes, plural } from '../lib/format'
import type { Segment } from '../lib/types'
import { useWorkspace } from '../state/WorkspaceContext'
import { Menu } from './Menu'
import { PageTile } from './PageTile'
import { Thumbnail } from './Thumbnail'

interface Props {
  segment: Segment
  index: number
  count: number
  /** Whether a page (not a card) is currently being dragged. */
  pageDragActive: boolean
}

const MINI_PREVIEW_COUNT = 8

export const SegmentCard = memo(function SegmentCard({ segment, index, count, pageDragActive }: Props) {
  const { dispatch, sources } = useWorkspace()
  const [editing, setEditing] = useState(false)

  const info = useMemo(() => {
    const sourceIds = new Set(segment.pages.map((p) => p.sourceId))
    const excluded = segment.pages.filter((p) => p.excluded).length
    const rotated = segment.pages.some((p) => p.rotation !== 0)
    const only = sourceIds.size === 1 ? sources[[...sourceIds][0]] : undefined
    // File size is only meaningful while the card still holds exactly its original file.
    const pristineFile = only && segment.pages.length === only.pageCount ? only : undefined
    return { mixed: sourceIds.size > 1, sourceCount: sourceIds.size, excluded, rotated, pristineFile }
  }, [segment.pages, sources])

  const total = segment.pages.length
  const included = total - info.excluded
  const allExcluded = included === 0
  const id = segment.id

  return (
    <Draggable draggableId={id} index={index}>
      {(provided, snapshot) => (
        <section
          ref={provided.innerRef}
          {...provided.draggableProps}
          aria-label={`${segment.name}, ${plural(total, 'page')}`}
          className={`mb-4 rounded-2xl bg-white ring-1 transition-shadow ${
            snapshot.isDragging ? 'shadow-2xl ring-indigo-300' : 'shadow-sm ring-slate-200'
          } ${allExcluded ? 'opacity-75' : ''}`}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
            <div
              {...provided.dragHandleProps}
              aria-label={`Reorder ${segment.name}. Press space to pick up.`}
              className="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
            >
              <GripVertical className="size-5" aria-hidden />
            </div>

            <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
              {segment.pages[0] ? (
                <Thumbnail
                  sourceId={segment.pages[0].sourceId}
                  index={segment.pages[0].sourceIndex}
                  rotation={segment.pages[0].rotation}
                  cssSize={44}
                  className="size-full"
                />
              ) : (
                <FileText className="size-5 text-slate-400" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  autoFocus
                  defaultValue={segment.name}
                  aria-label="Card name"
                  maxLength={120}
                  onBlur={(e) => {
                    dispatch({ type: 'renameSegment', segmentId: id, name: e.currentTarget.value })
                    setEditing(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  className="w-full rounded-md border border-indigo-300 px-2 py-1 text-sm font-semibold outline-none ring-2 ring-indigo-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="group/name flex max-w-full items-center gap-1.5 rounded-md text-left"
                  title="Rename"
                >
                  <h3 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{segment.name}</h3>
                  <Pencil className="size-3.5 shrink-0 text-slate-300 opacity-0 transition group-hover/name:opacity-100 touch:opacity-100" aria-hidden />
                </button>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span>
                  {info.excluded > 0 ? `${included} of ${plural(total, 'page')}` : plural(total, 'page')}
                </span>
                {info.pristineFile && <span>· {formatBytes(info.pristineFile.size)}</span>}
                {info.mixed && <span>· from {info.sourceCount} files</span>}
                {info.excluded > 0 && (
                  <span className="rounded bg-amber-50 px-1.5 font-medium text-amber-700">{info.excluded} excluded</span>
                )}
                {info.rotated && <span className="rounded bg-indigo-50 px-1.5 font-medium text-indigo-700">rotated</span>}
              </p>
            </div>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => dispatch({ type: 'toggleExpanded', segmentId: id })}
                aria-expanded={segment.expanded}
                aria-label={segment.expanded ? 'Collapse pages' : 'Expand pages'}
                className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <span className="hidden sm:inline">{segment.expanded ? 'Hide' : 'Pages'}</span>
                <ChevronDown className={`size-5 transition-transform ${segment.expanded ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'removeSegment', segmentId: id })}
                aria-label={`Remove ${segment.name}`}
                title="Remove (undo with Ctrl+Z)"
                className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-[18px]" aria-hidden />
              </button>
              <Menu
                label={`More actions for ${segment.name}`}
                items={[
                  { label: 'Rotate all right', icon: <RotateCw />, onSelect: () => dispatch({ type: 'rotateSegment', segmentId: id, delta: 90 }) },
                  { label: 'Rotate all left', icon: <RotateCcw />, onSelect: () => dispatch({ type: 'rotateSegment', segmentId: id, delta: -90 }) },
                  allExcluded
                    ? { label: 'Include all pages', icon: <Eye />, onSelect: () => dispatch({ type: 'setSegmentExcluded', segmentId: id, excluded: false }) }
                    : { label: 'Exclude all pages', icon: <EyeOff />, onSelect: () => dispatch({ type: 'setSegmentExcluded', segmentId: id, excluded: true }) },
                  { label: 'Reset rotation & exclusions', icon: <Undo2 />, disabled: !info.rotated && info.excluded === 0, onSelect: () => dispatch({ type: 'resetSegment', segmentId: id }) },
                  { label: 'Move up', icon: <ArrowUp />, disabled: index === 0, onSelect: () => dispatch({ type: 'moveSegment', from: index, to: index - 1 }) },
                  { label: 'Move down', icon: <ArrowDown />, disabled: index === count - 1, onSelect: () => dispatch({ type: 'moveSegment', from: index, to: index + 1 }) },
                  { label: 'Rename', icon: <Pencil />, onSelect: () => setEditing(true) },
                ]}
              />
            </div>
          </div>

          {/* Pages */}
          <Droppable droppableId={id} type="PAGE" direction="horizontal">
            {(drop, dropSnapshot) =>
              segment.expanded ? (
                <div
                  ref={drop.innerRef}
                  {...drop.droppableProps}
                  className={`strip-scroll flex overflow-x-auto border-t px-3 pb-3 pt-3 transition-colors sm:px-4 ${
                    dropSnapshot.isDraggingOver ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100'
                  }`}
                >
                  {segment.pages.map((page, i) => (
                    <PageTile
                      key={page.id}
                      page={page}
                      index={i}
                      segmentId={id}
                      sourceLabel={info.mixed ? sources[page.sourceId]?.name : undefined}
                    />
                  ))}
                  {drop.placeholder}
                </div>
              ) : (
                <div
                  ref={drop.innerRef}
                  {...drop.droppableProps}
                  className={`flex items-center gap-1.5 overflow-hidden border-t px-3 py-2 transition-colors sm:px-4 ${
                    dropSnapshot.isDraggingOver
                      ? 'border-indigo-200 bg-indigo-50'
                      : pageDragActive
                        ? 'border-dashed border-indigo-200 bg-indigo-50/30'
                        : 'border-slate-100'
                  }`}
                >
                  {pageDragActive ? (
                    <span className="py-2 text-xs font-medium text-indigo-600">Drop to add to the end of this card</span>
                  ) : (
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1.5"
                      onClick={() => dispatch({ type: 'toggleExpanded', segmentId: id })}
                      aria-label={`Show pages of ${segment.name}`}
                    >
                      {segment.pages.slice(0, MINI_PREVIEW_COUNT).map((p) => (
                        <Thumbnail
                          key={p.id}
                          sourceId={p.sourceId}
                          index={p.sourceIndex}
                          rotation={p.rotation}
                          cssSize={44}
                          className={`h-9 w-7 shrink-0 rounded-sm bg-slate-50 ring-1 ring-slate-200 ${p.excluded ? 'opacity-30' : ''}`}
                        />
                      ))}
                      {total > MINI_PREVIEW_COUNT && (
                        <span className="pl-1 text-xs font-medium text-slate-500">+{total - MINI_PREVIEW_COUNT}</span>
                      )}
                    </button>
                  )}
                  <span className="hidden">{drop.placeholder}</span>
                </div>
              )
            }
          </Droppable>
        </section>
      )}
    </Draggable>
  )
})
