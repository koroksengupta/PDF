import { DragDropContext, Droppable, type BeforeCapture, type DropResult } from '@hello-pangea/dnd'
import { SquarePlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { Segment } from '../lib/types'
import { NEW_SEGMENT_DROP_ID } from '../state/workspace'
import { useWorkspace } from '../state/WorkspaceContext'
import { SegmentCard } from './SegmentCard'

const CANVAS_ID = '__canvas__'

export function Canvas({ segments }: { segments: Segment[] }) {
  const { dispatch } = useWorkspace()
  const [pageDragActive, setPageDragActive] = useState(false)

  // Runs before dimensions are captured, so the "new section" zone can grow first.
  const onBeforeCapture = useCallback(
    (before: BeforeCapture) => {
      const isPage = segments.every((s) => s.id !== before.draggableId)
      setPageDragActive(isPage)
    },
    [segments],
  )

  const onDragEnd = useCallback(
    (result: DropResult) => {
      setPageDragActive(false)
      const { source, destination, type } = result
      if (!destination) return
      if (type === 'SEGMENT') {
        dispatch({ type: 'moveSegment', from: source.index, to: destination.index })
      } else {
        dispatch({
          type: 'movePage',
          fromSegmentId: source.droppableId,
          fromIndex: source.index,
          toSegmentId: destination.droppableId,
          toIndex: destination.index,
        })
      }
    },
    [dispatch],
  )

  return (
    <DragDropContext onBeforeCapture={onBeforeCapture} onDragEnd={onDragEnd}>
      <Droppable droppableId={CANVAS_ID} type="SEGMENT">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {segments.map((segment, index) => (
              <SegmentCard
                key={segment.id}
                segment={segment}
                index={index}
                count={segments.length}
                pageDragActive={pageDragActive}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <Droppable droppableId={NEW_SEGMENT_DROP_ID} type="PAGE" direction="horizontal">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-medium transition-all ${
              pageDragActive ? 'h-28 opacity-100' : 'h-14 opacity-70'
            } ${
              snapshot.isDraggingOver
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 text-slate-500'
            }`}
          >
            <SquarePlus className="size-5" aria-hidden />
            <span>{pageDragActive ? 'Drop here to start a new section' : 'Drag a page here to split it into a new section'}</span>
            <span className="hidden">{provided.placeholder}</span>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
