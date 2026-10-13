export type Rotation = 0 | 90 | 180 | 270

/** Metadata for an ingested PDF. The raw bytes live outside React state (see sourceStore). */
export interface SourceMeta {
  id: string
  name: string
  size: number
  pageCount: number
}

/** One page on the canvas, pointing back at the page of the source file it came from. */
export interface PageRef {
  id: string
  sourceId: string
  /** Zero-based page index inside the source PDF. */
  sourceIndex: number
  /** Extra rotation applied by the user, on top of the page's own /Rotate. */
  rotation: Rotation
  excluded: boolean
}

/** A card on the canvas: initially one per uploaded file; pages can move between cards. */
export interface Segment {
  id: string
  name: string
  pages: PageRef[]
  expanded: boolean
}

export type PageNumberFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total'
export type PageNumberPosition = 'left' | 'center' | 'right'

export interface PageNumberOptions {
  enabled: boolean
  format: PageNumberFormat
  position: PageNumberPosition
  fontSize: number
  startAt: number
}

export interface StitchOptions {
  separatorPages: boolean
  pageNumbers: PageNumberOptions
  /** Written into the output's document-info Title. */
  title: string
}

export interface StitchPlanPage {
  sourceId: string
  sourceIndex: number
  rotation: Rotation
}

export interface StitchPlan {
  sources: { id: string; bytes: ArrayBuffer }[]
  /** Only included pages, grouped per card. Empty groups are skipped. */
  segments: StitchPlanPage[][]
  options: StitchOptions
}

export type StitchPhase = 'loading' | 'copying' | 'numbering' | 'saving'

export interface StitchProgress {
  phase: StitchPhase
  done: number
  total: number
}

export type InspectErrorCode = 'not-pdf' | 'encrypted' | 'corrupt' | 'empty'

export interface InspectResult {
  pageCount: number
}
