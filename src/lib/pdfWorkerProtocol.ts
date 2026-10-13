import type { InspectErrorCode, InspectResult, StitchPlan, StitchProgress } from './types'

export type WorkerRequest =
  | { id: number; type: 'inspect'; bytes: ArrayBuffer }
  | { id: number; type: 'stitch'; plan: StitchPlan }

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: StitchProgress }
  | { id: number; type: 'result'; result: InspectResult | Uint8Array }
  | { id: number; type: 'error'; code?: InspectErrorCode; message: string }
