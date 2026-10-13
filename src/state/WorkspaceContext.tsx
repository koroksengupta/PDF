import { createContext, useContext, type Dispatch } from 'react'
import type { SourceMeta } from '../lib/types'
import type { WorkspaceAction } from './workspace'

export interface WorkspaceContextValue {
  dispatch: Dispatch<WorkspaceAction>
  sources: Record<string, SourceMeta>
  openPreview: (segmentId: string, pageId: string) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceContext')
  return ctx
}
