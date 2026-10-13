import {
  EncryptedPDFError,
  PDFDocument,
  PDFPage,
  StandardFonts,
  degrees,
  type PDFFont,
} from 'pdf-lib'
import { drawMarginLabel } from './edits'
import { PdfInspectError } from './errors'
import type {
  InspectResult,
  PageNumberOptions,
  SplitProgress,
  StitchPlan,
  StitchProgress,
} from './types'
import type { PageRange } from './split'

export { PdfInspectError }

const LOAD_OPTIONS = { updateMetadata: false } as const

/** The PDF spec allows junk before the header; Acrobat accepts it within the first 1024 bytes. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 5, 1024)
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true
    }
  }
  return false
}

export function isEncryptedError(err: unknown): boolean {
  return (
    err instanceof EncryptedPDFError ||
    (err instanceof Error && /encrypt/i.test(err.message))
  )
}

/** Validates that pdf-lib can work with the file and returns its page count. */
export async function inspectPdf(buffer: ArrayBuffer): Promise<InspectResult> {
  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0 || !hasPdfHeader(bytes)) {
    throw new PdfInspectError('not-pdf', 'File is not a PDF document.')
  }

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, LOAD_OPTIONS)
  } catch (err) {
    if (isEncryptedError(err)) {
      throw new PdfInspectError(
        'encrypted',
        'File is password-protected or encrypted. Remove the protection and try again.',
      )
    }
    throw new PdfInspectError('corrupt', 'File is damaged or could not be parsed.')
  }

  let pageCount: number
  try {
    const pages = doc.getPages()
    // Touch every page's geometry so broken page trees fail now, not at stitch time.
    for (const page of pages) page.getSize()
    pageCount = pages.length
  } catch {
    throw new PdfInspectError('corrupt', 'File has a damaged page structure.')
  }
  if (pageCount === 0) {
    throw new PdfInspectError('empty', 'File contains no pages.')
  }
  return { pageCount }
}

export const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360

export function formatPageNumber(
  format: PageNumberOptions['format'],
  n: number,
  total: number,
): string {
  switch (format) {
    case 'n':
      return `${n}`
    case 'page-n':
      return `Page ${n}`
    case 'n-of-total':
      return `${n} / ${total}`
    case 'page-n-of-total':
      return `Page ${n} of ${total}`
  }
}

/** Footer label at the visual bottom of the page (upright on rotated pages). */
export function drawFooterLabel(
  page: PDFPage,
  text: string,
  font: PDFFont,
  fontSize: number,
  position: PageNumberOptions['position'],
) {
  drawMarginLabel(page, text, font, fontSize, 'bottom', position)
}

/** Builds the stitched document. Pure: safe to run in a worker or in tests. */
export async function stitchPdf(
  plan: StitchPlan,
  onProgress: (p: StitchProgress) => void = () => {},
): Promise<Uint8Array> {
  const segments = plan.segments.filter((s) => s.length > 0)
  const totalPages = segments.reduce((n, s) => n + s.length, 0)
  if (totalPages === 0) throw new Error('No pages selected to stitch.')

  const out = await PDFDocument.create()
  const { options } = plan

  // Copy pages one source at a time so only one source document is parsed in memory at once.
  // A page may in principle appear more than once, so each occurrence gets its own copy.
  const needed = new Map<string, number[]>()
  for (const seg of segments) {
    for (const p of seg) {
      const list = needed.get(p.sourceId) ?? []
      list.push(p.sourceIndex)
      needed.set(p.sourceId, list)
    }
  }
  const copies = new Map<string, PDFPage[]>()
  const bytesById = new Map(plan.sources.map((s) => [s.id, s.bytes]))
  let loaded = 0
  onProgress({ phase: 'loading', done: 0, total: needed.size })
  for (const [sourceId, indices] of needed) {
    const bytes = bytesById.get(sourceId)
    if (!bytes) throw new Error('A source file is missing from the stitch plan.')
    let src: PDFDocument
    try {
      src = await PDFDocument.load(bytes, LOAD_OPTIONS)
    } catch (err) {
      throw new Error(
        isEncryptedError(err)
          ? 'A source file is encrypted and cannot be stitched.'
          : 'A source file could not be read.',
      )
    }
    const pageCount = src.getPageCount()
    for (const i of indices) {
      if (i < 0 || i >= pageCount) throw new Error(`Page ${i + 1} does not exist in its source file.`)
    }
    const copied = await out.copyPages(src, indices)
    copied.forEach((page, k) => {
      const key = `${sourceId}:${indices[k]}`
      const list = copies.get(key) ?? []
      list.push(page)
      copies.set(key, list)
    })
    onProgress({ phase: 'loading', done: ++loaded, total: needed.size })
  }

  const separatorIndices = new Set<number>()
  let added = 0
  segments.forEach((seg, segIndex) => {
    if (options.separatorPages && segIndex > 0) {
      // Blank page in the same visual size/orientation as the page before it.
      const prev = out.getPage(out.getPageCount() - 1)
      const { width, height } = prev.getCropBox()
      const sideways = normalizeAngle(prev.getRotation().angle) % 180 !== 0
      separatorIndices.add(out.getPageCount())
      out.addPage(sideways ? [height, width] : [width, height])
    }
    for (const p of seg) {
      const page = copies.get(`${p.sourceId}:${p.sourceIndex}`)!.shift()!
      out.addPage(page)
      page.setRotation(degrees(normalizeAngle(page.getRotation().angle + p.rotation)))
      onProgress({ phase: 'copying', done: ++added, total: totalPages })
    }
  })

  const { pageNumbers } = options
  if (pageNumbers.enabled) {
    const font = await out.embedFont(StandardFonts.Helvetica)
    const pages = out.getPages()
    const start = Number.isFinite(pageNumbers.startAt) ? Math.trunc(pageNumbers.startAt) : 1
    const fontSize = Math.min(Math.max(pageNumbers.fontSize || 10, 6), 24)
    const last = start + pages.length - 1
    pages.forEach((page, i) => {
      // Separators are counted (so printed numbering matches physical pages) but left blank.
      if (!separatorIndices.has(i)) {
        const label = formatPageNumber(pageNumbers.format, start + i, last)
        drawFooterLabel(page, label, font, fontSize, pageNumbers.position)
      }
      onProgress({ phase: 'numbering', done: i + 1, total: pages.length })
    })
  }

  onProgress({ phase: 'saving', done: 0, total: 1 })
  const title = options.title.trim()
  if (title) out.setTitle(title)
  out.setCreator('PDF Stitch')
  out.setProducer('PDF Stitch (pdf-lib, in-browser)')
  const now = new Date()
  out.setCreationDate(now)
  out.setModificationDate(now)
  const result = await out.save({ useObjectStreams: true })
  onProgress({ phase: 'saving', done: 1, total: 1 })
  return result
}

/**
 * Splits one PDF into several, one per range (1-based, inclusive). Each part is a
 * standalone document; page rotation and content are preserved as-is.
 */
export async function splitPdf(
  buffer: ArrayBuffer,
  ranges: PageRange[],
  title: string,
  onProgress: (p: SplitProgress) => void = () => {},
): Promise<Uint8Array[]> {
  if (ranges.length === 0) throw new Error('No parts to create.')
  let src: PDFDocument
  try {
    src = await PDFDocument.load(new Uint8Array(buffer), LOAD_OPTIONS)
  } catch (err) {
    throw new Error(
      isEncryptedError(err) ? 'The file is encrypted and cannot be split.' : 'The file could not be read.',
    )
  }
  const pageCount = src.getPageCount()
  for (const r of ranges) {
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1 || r.end > pageCount || r.start > r.end) {
      throw new Error(`Invalid page range ${r.start}–${r.end} for a ${pageCount}-page file.`)
    }
  }

  const baseTitle = title.trim()
  const parts: Uint8Array[] = []
  onProgress({ done: 0, total: ranges.length })
  for (const [i, r] of ranges.entries()) {
    const out = await PDFDocument.create()
    const indices = Array.from({ length: r.end - r.start + 1 }, (_, k) => r.start - 1 + k)
    for (const page of await out.copyPages(src, indices)) out.addPage(page)
    if (baseTitle) out.setTitle(`${baseTitle} (part ${i + 1} of ${ranges.length})`)
    out.setCreator('PDF Stitch')
    out.setProducer('PDF Stitch (pdf-lib, in-browser)')
    parts.push(await out.save({ useObjectStreams: true }))
    onProgress({ done: i + 1, total: ranges.length })
  }
  return parts
}
