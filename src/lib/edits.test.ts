import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { readFormInfo, transformPdf } from './edits'
import type { EditObject, PageNumberParams, WatermarkParams } from './editTypes'
import { anchorForCentered, parsePageList, visualToUser } from './geometry'

const toBuffer = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer

async function makePdf(rotations: number[], size: [number, number] = [300, 500]) {
  const doc = await PDFDocument.create()
  for (const r of rotations) doc.addPage(size).setRotation(degrees(r))
  return toBuffer(await doc.save())
}

/** Every text run on each page, in viewer (visual) coordinates, via pdf.js. */
async function visualText(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const items = (await page.getTextContent()).items.filter((it) => 'str' in it && it.str.trim()) as {
      str: string
      transform: number[]
    }[]
    pages.push({
      width: vp.width,
      height: vp.height,
      items: items.map((it) => {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
        const [ex, ey] = vp.convertToViewportPoint(it.transform[4] + it.transform[0], it.transform[5] + it.transform[1])
        // Reading direction on screen, in degrees counter-clockwise from "left to right".
        const dir = Math.round((Math.atan2(-(ey - y), ex - x) * 180) / Math.PI) + 0 // normalise -0
        return { str: it.str, x, y, dir }
      }),
    })
  }
  await pdf.destroy()
  return pages
}

describe('geometry', () => {
  const box = { x: 10, y: 20, width: 300, height: 500 }
  it('maps visual corners onto user space for every rotation', () => {
    // Visual top-left corner for each rotation.
    expect(visualToUser(box, 0, 0, 0)).toEqual({ x: 10, y: 520 })
    expect(visualToUser(box, 90, 0, 0)).toEqual({ x: 10, y: 20 })
    expect(visualToUser(box, 180, 0, 0)).toEqual({ x: 310, y: 20 })
    expect(visualToUser(box, 270, 0, 0)).toEqual({ x: 310, y: 520 })
  })

  it('centres rotated items', () => {
    const a = anchorForCentered({ x: 100, y: 100 }, 40, 10, 90)
    expect(a.x).toBeCloseTo(105)
    expect(a.y).toBeCloseTo(80)
  })

  it('parses page lists', () => {
    expect(parsePageList('', 4)).toEqual({ pages: [1, 2, 3, 4] })
    expect(parsePageList('1-2, 4', 5)).toEqual({ pages: [1, 2, 4] })
    expect(parsePageList('3-', 5)).toEqual({ pages: [3, 4, 5] })
    expect(parsePageList('2 2 1', 5)).toEqual({ pages: [1, 2] })
    expect(parsePageList('0', 5)).toHaveProperty('error')
    expect(parsePageList('4-9', 5)).toHaveProperty('error')
    expect(parsePageList('a', 5)).toHaveProperty('error')
  })
})

describe('page numbers', () => {
  const params: PageNumberParams = {
    template: 'Page {n} of {total}',
    vertical: 'top',
    align: 'right',
    fontSize: 10,
    startAt: 1,
    pages: [],
    color: '#000000',
  }

  it('stamps upright labels in the chosen corner on every rotation', async () => {
    const out = await transformPdf(await makePdf([0, 90, 180, 270]), { kind: 'pageNumbers', params })
    const pages = await visualText(out)
    pages.forEach((p, i) => {
      expect(p.items.map((t) => t.str)).toEqual([`Page ${i + 1} of 4`])
      const t = p.items[0]
      expect(t.dir).toBe(0) // reads left-to-right on screen
      expect(t.y).toBeLessThan(45) // near the visual top
      expect(t.x).toBeGreaterThan(p.width / 2) // right half
    })
  })

  it('numbers only selected pages, from a custom start', async () => {
    const out = await transformPdf(await makePdf([0, 0, 0, 0]), {
      kind: 'pageNumbers',
      params: { ...params, template: '{n}', pages: [2, 3, 4], startAt: 10, vertical: 'bottom', align: 'center' },
    })
    const pages = await visualText(out)
    expect(pages.map((p) => p.items.map((t) => t.str).join())).toEqual(['', '10', '11', '12'])
    expect(pages[1].items[0].y).toBeGreaterThan(pages[1].height - 40)
  })
})

describe('watermark', () => {
  const params: WatermarkParams = {
    kind: 'text',
    text: 'CONFIDENTIAL',
    fontSize: 40,
    bold: true,
    color: '#ff0000',
    opacity: 0.3,
    angle: 45,
    layout: 'center',
    imageScale: 0.4,
    pages: [],
  }

  it('centres the text at the requested on-screen angle, whatever the page rotation', async () => {
    const out = await transformPdf(await makePdf([0, 90, 270]), { kind: 'watermark', params })
    for (const p of await visualText(out)) {
      expect(p.items).toHaveLength(1)
      expect(p.items[0].dir).toBe(45)
    }
    // Text is centred: the start of the run lies down-left of the page centre.
    const [first] = await visualText(out)
    expect(first.items[0].x).toBeLessThan(first.width / 2)
    expect(first.items[0].y).toBeGreaterThan(first.height / 2)
  })

  it('tiles across the page and respects the page list', async () => {
    const out = await transformPdf(await makePdf([0, 0]), {
      kind: 'watermark',
      params: { ...params, layout: 'tile', fontSize: 16, pages: [2] },
    })
    const [p1, p2] = await visualText(out)
    expect(p1.items).toHaveLength(0)
    expect(p2.items.length).toBeGreaterThan(4)
  })

  it('stamps images', async () => {
    // 1×1 red PNG.
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    )
    const out = await transformPdf(await makePdf([0]), {
      kind: 'watermark',
      params: { ...params, kind: 'image', image: { bytes: png, type: 'png' } },
    })
    const doc = await PDFDocument.load(out)
    const xobjects = doc.getPage(0).node.Resources()!.toString()
    expect(xobjects).toMatch(/XObject/)
  })

  it('rejects empty text', async () => {
    await expect(
      transformPdf(await makePdf([0]), { kind: 'watermark', params: { ...params, text: '  ' } }),
    ).rejects.toThrow(/Enter the watermark text/)
  })
})

describe('annotations', () => {
  it('draws text boxes at their visual position (wrapping, upright) on rotated pages', async () => {
    const objects: EditObject[] = [0, 1].map((page) => ({
      id: `t${page}`,
      page,
      kind: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.2,
      text: 'Hello there wonderful world, this sentence is long enough to wrap on any page',
      fontSize: 12,
      color: '#000000',
    }))
    const out = await transformPdf(await makePdf([0, 90]), { kind: 'annotate', params: { objects, images: {} } })
    for (const p of await visualText(out)) {
      expect(p.items.length).toBeGreaterThan(1) // wrapped to several lines
      const t = p.items[0]
      expect(t.dir).toBe(0)
      expect(t.x / p.width).toBeCloseTo(0.1, 1)
      expect(t.y / p.height).toBeGreaterThan(0.2)
      expect(t.y / p.height).toBeLessThan(0.3)
    }
  })

  it('adds sticky notes as real PDF comments and replaces unsupported characters', async () => {
    const objects: EditObject[] = [
      { id: 'n', page: 0, kind: 'note', x: 0.5, y: 0.5, text: 'Check this ✓', color: '#facc15' },
      { id: 't', page: 0, kind: 'text', x: 0.1, y: 0.1, w: 0.8, h: 0.1, text: 'Tick ✓ done', fontSize: 12, color: '#000000' },
      { id: 'h', page: 0, kind: 'highlight', x: 0.1, y: 0.4, w: 0.3, h: 0.05, color: '#fde047' },
      { id: 'r', page: 0, kind: 'rect', x: 0.1, y: 0.6, w: 0.3, h: 0.1, color: '#ff0000', strokeWidth: 2 },
      { id: 'e', page: 0, kind: 'ellipse', x: 0.5, y: 0.6, w: 0.3, h: 0.1, color: '#ff0000', strokeWidth: 2 },
      { id: 'p', page: 0, kind: 'pen', points: [[0.1, 0.9], [0.2, 0.95], [0.3, 0.9]], color: '#0000ff', strokeWidth: 3 },
    ]
    const out = await transformPdf(await makePdf([0]), { kind: 'annotate', params: { objects, images: {} } })
    const pdf = await getDocument({ data: out.slice(), isEvalSupported: false }).promise
    const annots = await (await pdf.getPage(1)).getAnnotations()
    expect(annots).toHaveLength(1)
    expect(annots[0].subtype).toBe('Text')
    expect(annots[0].contentsObj.str).toBe('Check this ✓')
    await pdf.destroy()
    const [p] = await visualText(out)
    expect(p.items.map((t) => t.str).join(' ')).toContain('Tick ? done')
  })
})

describe('forms', () => {
  async function makeForm() {
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const page2 = doc.addPage([400, 400])
    const form = doc.getForm()
    const name = form.createTextField('name')
    name.addToPage(page, { x: 20, y: 300, width: 200, height: 20 })
    const agree = form.createCheckBox('agree')
    agree.addToPage(page, { x: 20, y: 260, width: 15, height: 15 })
    const colour = form.createDropdown('colour')
    colour.addOptions(['Red', 'Green'])
    colour.addToPage(page2, { x: 20, y: 300, width: 100, height: 20 })
    const size = form.createRadioGroup('size')
    size.addOptionToPage('S', page2, { x: 20, y: 200, width: 15, height: 15 })
    size.addOptionToPage('L', page2, { x: 50, y: 200, width: 15, height: 15 })
    return toBuffer(await doc.save())
  }

  it('reads fields with their types, options and pages', async () => {
    const info = await readFormInfo(await makeForm())
    expect(info.hasXfa).toBe(false)
    expect(info.fields.map((f) => [f.name, f.type, f.page])).toEqual([
      ['name', 'text', 1],
      ['agree', 'checkbox', 1],
      ['colour', 'dropdown', 2],
      ['size', 'radio', 2],
    ])
    expect(info.fields[2].options).toEqual(['Red', 'Green'])
  })

  it('fills fields, and can flatten them', async () => {
    const values = { name: 'Ada Lovelace', agree: true, colour: 'Green', size: 'L' }
    const filled = await transformPdf(await makeForm(), { kind: 'fillForm', params: { values, flatten: false } })
    const info = await readFormInfo(toBuffer(filled))
    expect(Object.fromEntries(info.fields.map((f) => [f.name, f.value]))).toEqual(values)

    const flat = await transformPdf(await makeForm(), { kind: 'fillForm', params: { values, flatten: true } })
    expect((await readFormInfo(toBuffer(flat))).fields).toHaveLength(0)
    const [p1] = await visualText(flat)
    expect(p1.items.map((t) => t.str).join()).toContain('Ada Lovelace')
  })

  it('reports text the standard font cannot show', async () => {
    await expect(
      transformPdf(await makeForm(), { kind: 'fillForm', params: { values: { name: 'नमस्ते' }, flatten: false } }),
    ).rejects.toThrow(/characters/)
  })
})
