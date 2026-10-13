import type { PageRange } from './split'
import type { InspectErrorCode, InspectResult, SplitProgress, StitchPlan, StitchProgress } from './types'

export type WorkerRequest =
  | { id: number; type: 'inspect'; bytes: ArrayBuffer }
  | { id: number; type: 'stitch'; plan: StitchPlan }
  | { id: number; type: 'split'; bytes: ArrayBuffer; ranges: PageRange[]; title: string }

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: StitchProgress | SplitProgress }
  | { id: number; type: 'result'; result: InspectResult | Uint8Array | Uint8Array[] }
  | { id: number; type: 'error'; code?: InspectErrorCode; message: string }
