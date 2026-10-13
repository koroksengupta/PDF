import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { PdfInspectError, formatPageNumber, hasPdfHeader, inspectPdf, stitchPdf } from './pdfEngine'
import type { StitchOptions, StitchPlan, StitchPlanPage } from './types'

const toBuffer = (u8: Uint8Array) =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer

/** Creates a PDF whose pages have distinct sizes so we can identify them after stitching. */
async function makePdf(sizes: [number, number][], rotate: number[] = []) {
  const doc = await PDFDocument.create()
  sizes.forEach((size, i) => {
    const page = doc.addPage(size)
    if (rotate[i]) page.setRotation(degrees(rotate[i]))
  })
  return toBuffer(await doc.save())
}

const baseOptions: StitchOptions = {
  separatorPages: false,
  title: '',
  pageNumbers: { enabled: false, format: 'n', position: 'center', fontSize: 10, startAt: 1 },
}

const plan = (
  sources: Record<string, ArrayBuffer>,
  segments: StitchPlanPage[][],
  options: Partial<StitchOptions> = {},
): StitchPlan => ({
  sources: Object.entries(sources).map(([id, bytes]) => ({ id, bytes })),
  segments,
  options: { ...baseOptions, ...options },
})

const pg = (sourceId: string, sourceIndex: number, rotation: 0 | 90 | 180 | 270 = 0) => ({
  sourceId,
  sourceIndex,
  rotation,
})

async function describePages(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => ({
    w: p.getWidth(),
    h: p.getHeight(),
    rot: p.getRotation().angle,
  }))
}

describe('hasPdfHeader / inspectPdf', () => {
  it('accepts a valid PDF and reports its page count', async () => {
    const bytes = await makePdf([[100, 100], [200, 200], [300, 300]])
    await expect(inspectPdf(bytes)).resolves.toEqual({ pageCount: 3 })
  })

  it('accepts junk before the header (within 1KB)', () => {
    const junk = new Uint8Array(500).fill(32)
    const header = new TextEncoder().encode('%PDF-1.7')
    const bytes = new Uint8Array(junk.length + header.length)
    bytes.set(junk)
    bytes.set(header, junk.length)
    expect(hasPdfHeader(bytes)).toBe(true)
  })

  it('rejects non-PDF and empty data', async () => {
    const text = toBuffer(new TextEncoder().encode('hello world, definitely not a pdf'))
    await expect(inspectPdf(text)).rejects.toMatchObject({ code: 'not-pdf' })
    await expect(inspectPdf(new ArrayBuffer(0))).rejects.toMatchObject({ code: 'not-pdf' })
  })

  it('rejects a truncated / corrupted PDF', async () => {
    const full = new Uint8Array(await makePdf([[100, 100]]))
    const garbage = new Uint8Array(400)
    garbage.set(full.slice(0, 20))
    for (let i = 20; i < garbage.length; i++) garbage[i] = (i * 31) % 251
    const err = await inspectPdf(toBuffer(garbage)).catch((e) => e)
    expect(err).toBeInstanceOf(PdfInspectError)
    expect(['corrupt', 'empty']).toContain(err.code)
  })

  it('rejects encrypted PDFs', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const encryptDict = doc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 })
    doc.context.trailerInfo.Encrypt = doc.context.register(encryptDict)
    const bytes = await doc.save({ useObjectStreams: false })
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/Encrypt')
    await expect(inspectPdf(toBuffer(bytes))).rejects.toMatchObject({ code: 'encrypted' })
  })
})

describe('stitchPdf', () => {
  it('merges files in order', async () => {
    const a = await makePdf([[100, 101], [100, 102]])
    const b = await makePdf([[200, 201]])
    const out = await stitchPdf(plan({ a, b }, [[pg('a', 0), pg('a', 1)], [pg('b', 0)]]))
    expect((await describePages(out)).map((p) => p.h)).toEqual([101, 102, 201])
  })

  it('honours page reordering across files and exclusion (pages left out of the plan)', async () => {
    const a = await makePdf([[100, 101], [100, 102], [100, 103]])
    const b = await makePdf([[200, 201], [200, 202]])
    const out = await stitchPdf(
      plan({ a, b }, [[pg('b', 1), pg('a', 2)], [pg('a', 0), pg('b', 0)]]),
    )
    expect((await describePages(out)).map((p) => p.h)).toEqual([202, 103, 101, 201])
  })

  it('adds user rotation on top of existing /Rotate', async () => {
    const a = await makePdf([[100, 100], [100, 100], [100, 100]], [0, 90, 270])
    const out = await stitchPdf(plan({ a }, [[pg('a', 0, 90), pg('a', 1, 270), pg('a', 2, 180)]]))
    expect((await describePages(out)).map((p) => p.rot)).toEqual([90, 0, 90])
  })

  it('inserts blank separators between non-empty groups only, matching visual size', async () => {
    const a = await makePdf([[300, 400]])
    const b = await makePdf([[500, 600]])
    const out = await stitchPdf(
      plan({ a, b }, [[pg('a', 0, 90)], [], [pg('b', 0)]], { separatorPages: true }),
    )
    const pages = await describePages(out)
    expect(pages).toHaveLength(3)
    // Separator mirrors the landscape look of the rotated page before it.
    expect(pages[1]).toEqual({ w: 400, h: 300, rot: 0 })
    expect(pages[2].h).toBe(600)
  })

  it('supports the same source page appearing twice', async () => {
    const a = await makePdf([[100, 111]])
    const out = await stitchPdf(plan({ a }, [[pg('a', 0)], [pg('a', 0, 90)]]))
    expect(await describePages(out)).toEqual([
      { w: 100, h: 111, rot: 0 },
      { w: 100, h: 111, rot: 90 },
    ])
  })

  it('reports progress through every phase and finishes at saving', async () => {
    const a = await makePdf([[100, 100], [100, 100]])
    const phases: string[] = []
    await stitchPdf(
      plan({ a }, [[pg('a', 0), pg('a', 1)]], {
        pageNumbers: { ...baseOptions.pageNumbers, enabled: true },
      }),
      (p) => phases.push(p.phase),
    )
    expect(new Set(phases)).toEqual(new Set(['loading', 'copying', 'numbering', 'saving']))
    expect(phases.at(-1)).toBe('saving')
  })

  it('rejects empty plans and out-of-range pages', async () => {
    const a = await makePdf([[100, 100]])
    await expect(stitchPdf(plan({ a }, [[], []]))).rejects.toThrow(/No pages/)
    await expect(stitchPdf(plan({ a }, [[pg('a', 5)]]))).rejects.toThrow(/does not exist/)
    await expect(stitchPdf(plan({}, [[pg('a', 0)]]))).rejects.toThrow(/missing/)
  })

  it('writes the title into document metadata', async () => {
    const a = await makePdf([[100, 100]])
    const out = await stitchPdf(plan({ a }, [[pg('a', 0)]], { title: 'Quarterly pack' }))
    const doc = await PDFDocument.load(out, { updateMetadata: false })
    expect(doc.getTitle()).toBe('Quarterly pack')
    expect(doc.getProducer()).toMatch(/PDF Stitch/)
  })
})

describe('page numbers', () => {
  it('formats labels', () => {
    expect(formatPageNumber('n', 3, 9)).toBe('3')
    expect(formatPageNumber('page-n', 3, 9)).toBe('Page 3')
    expect(formatPageNumber('n-of-total', 3, 9)).toBe('3 / 9')
    expect(formatPageNumber('page-n-of-total', 3, 9)).toBe('Page 3 of 9')
  })

  /**
   * Renders with pdf.js (which applies /Rotate like a real viewer) and checks that every
   * label lands at the visual bottom-centre of its page, upright, regardless of rotation.
   */
  it('places labels at the visual bottom of rotated pages and skips separators', async () => {
    const a = await makePdf([[300, 500], [300, 500], [300, 500], [300, 500]], [0, 90, 0, 0])
    const b = await makePdf([[400, 300]])
    const out = await stitchPdf(
      plan(
        { a, b },
        [[pg('a', 0), pg('a', 1), pg('a', 2, 180), pg('a', 3, 270)], [pg('b', 0)]],
        {
          separatorPages: true,
          pageNumbers: { enabled: true, format: 'page-n-of-total', position: 'center', fontSize: 10, startAt: 1 },
        },
      ),
    )

    const pdf = await getDocument({ data: out, useSystemFonts: false, isEvalSupported: false }).promise
    expect(pdf.numPages).toBe(6)
    const labels: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items.filter((it) => 'str' in it && it.str.trim())
      if (i === 5) {
        expect(items).toHaveLength(0) // separator page stays blank
        continue
      }
      expect(items).toHaveLength(1)
      const item = items[0] as { str: string; transform: number[] }
      labels.push(item.str)
      const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
      // Baseline sits near the visual bottom (viewport y grows downward)...
      expect(viewport.height - vy).toBeGreaterThan(5)
      expect(viewport.height - vy).toBeLessThan(40)
      // ...and the text starts left of centre and reads left-to-right (upright on screen).
      expect(vx).toBeLessThan(viewport.width / 2)
      expect(vx).toBeGreaterThan(viewport.width / 4)
      const [ex] = viewport.convertToViewportPoint(
        item.transform[4] + item.transform[0] * 10,
        item.transform[5] + item.transform[1] * 10,
      )
      expect(ex).toBeGreaterThan(vx)
    }
    expect(labels).toEqual(['Page 1 of 6', 'Page 2 of 6', 'Page 3 of 6', 'Page 4 of 6', 'Page 6 of 6'])
    await pdf.destroy()
  })
})
