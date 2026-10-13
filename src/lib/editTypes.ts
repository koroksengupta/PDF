/** Parameter types shared by the UI and the PDF engine (no pdf-lib imports here). */

export type VAlign = 'top' | 'bottom'
export type HAlign = 'left' | 'center' | 'right'

export interface PageNumberParams {
  /** Template with {n} (page number) and {total} placeholders, e.g. "Page {n} of {total}". */
  template: string
  vertical: VAlign
  align: HAlign
  fontSize: number
  /** Number printed on the first numbered page. */
  startAt: number
  /** 1-based pages to stamp; the others are counted but left blank. Empty = all. */
  pages: number[]
  color: string
}

export interface ImageAsset {
  bytes: Uint8Array
  type: 'png' | 'jpg'
}

export interface WatermarkParams {
  kind: 'text' | 'image'
  text: string
  fontSize: number
  bold: boolean
  color: string
  /** 0..1 */
  opacity: number
  /** Degrees, counter-clockwise as seen on screen. */
  angle: number
  layout: 'center' | 'tile'
  image?: ImageAsset
  /** Image width as a fraction of the page width. */
  imageScale: number
  /** 1-based pages; empty = all. */
  pages: number[]
}

/** Positions/sizes are fractions of the page as displayed; sizes in points. */
export type EditObject =
  | { id: string; page: number; kind: 'text'; x: number; y: number; w: number; h: number; text: string; fontSize: number; color: string }
  | { id: string; page: number; kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; strokeWidth: number }
  | { id: string; page: number; kind: 'highlight'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; page: number; kind: 'pen'; points: [number, number][]; color: string; strokeWidth: number }
  | { id: string; page: number; kind: 'note'; x: number; y: number; text: string; color: string }
  | { id: string; page: number; kind: 'image'; x: number; y: number; w: number; h: number; imageId: string }

export interface AnnotateParams {
  objects: EditObject[]
  images: Record<string, ImageAsset>
}

export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'optionlist' | 'other'

export interface FormFieldInfo {
  name: string
  type: FormFieldType
  value: string | boolean | string[]
  options: string[]
  multiline: boolean
  multiSelect: boolean
  readOnly: boolean
  required: boolean
  maxLength?: number
  /** 1-based page of the field's first widget, if known. */
  page: number | null
}

export interface FormInfo {
  fields: FormFieldInfo[]
  /** The file uses XFA (dynamic) forms, which can only be partly supported. */
  hasXfa: boolean
}

export interface FillFormParams {
  values: Record<string, string | boolean | string[]>
  flatten: boolean
}

export type TransformOp =
  | { kind: 'pageNumbers'; params: PageNumberParams }
  | { kind: 'watermark'; params: WatermarkParams }
  | { kind: 'annotate'; params: AnnotateParams }
  | { kind: 'fillForm'; params: FillFormParams }

export const PAGE_NUMBER_PRESETS = [
  { label: '1', template: '{n}' },
  { label: 'Page 1', template: 'Page {n}' },
  { label: '1 / 12', template: '{n} / {total}' },
  { label: 'Page 1 of 12', template: 'Page {n} of {total}' },
  { label: '- 1 -', template: '- {n} -' },
] as const

export const fillTemplate = (template: string, n: number, total: number) =>
  template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))
