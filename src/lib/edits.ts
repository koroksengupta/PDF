import {
  BlendMode,
  LineCapStyle,
  LineJoinStyle,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  StandardFonts,
  degrees,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib'
import type {
  AnnotateParams,
  FillFormParams,
  FormFieldInfo,
  FormInfo,
  HAlign,
  ImageAsset,
  PageNumberParams,
  TransformOp,
  VAlign,
  WatermarkParams,
} from './editTypes'
import { fillTemplate } from './editTypes'
import { anchorForCentered, hexToRgb01, toQuarterTurn, visualSize, visualToUser } from './geometry'

const LOAD_OPTIONS = { updateMetadata: false } as const

const color = (hex: string) => {
  const c = hexToRgb01(hex)
  return rgb(c.r, c.g, c.b)
}

/** Geometry of a page as displayed. */
function pageFrame(page: PDFPage) {
  const box = page.getCropBox()
  const rotation = toQuarterTurn(page.getRotation().angle)
  const size = visualSize(box, rotation)
  return { box, rotation, ...size, map: (u: number, v: number) => visualToUser(box, rotation, u, v) }
}

const isolated = new WeakSet<PDFPage>()
/**
 * Wraps the page's existing content in q/Q (once per page) so an unbalanced graphics
 * state left by the original producer can't skew what we draw on top.
 */
export function isolateExistingContent(page: PDFPage) {
  if (isolated.has(page)) return
  isolated.add(page)
  const ctx = page.doc.context
  page.node.normalizedEntries()
  const start = ctx.register(ctx.contentStream([pushGraphicsState()]))
  const end = ctx.register(ctx.contentStream([popGraphicsState()]))
  page.node.wrapContentStreams(start, end)
}

/** Standard fonts only cover WinAnsi; swap anything else for "?" instead of failing. */
export function encodable(font: PDFFont, text: string) {
  let out = ''
  for (const ch of text) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}

/**
 * Draws one line of text at a visual position: (u, v) is where the baseline starts
 * for left alignment, the baseline centre for center, or its end for right.
 */
export function drawVisualText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  u: number,
  v: number,
  opts: { align?: HAlign; color?: string; opacity?: number } = {},
) {
  const f = pageFrame(page)
  const width = font.widthOfTextAtSize(text, size)
  const shift = opts.align === 'center' ? width / 2 : opts.align === 'right' ? width : 0
  const p = f.map(u - shift / f.width, v)
  isolateExistingContent(page)
  page.drawText(text, {
    x: p.x,
    y: p.y,
    size,
    font,
    color: color(opts.color ?? '#3f3f4a'),
    opacity: opts.opacity,
    rotate: degrees(f.rotation),
  })
}

/** Label in a header/footer band, upright at the visual top or bottom of the page. */
export function drawMarginLabel(
  page: PDFPage,
  text: string,
  font: PDFFont,
  fontSize: number,
  vertical: VAlign,
  align: HAlign,
  textColor?: string,
) {
  const f = pageFrame(page)
  const margin = Math.max(18, fontSize * 2)
  const side = Math.max(36, fontSize * 3)
  const u = align === 'left' ? side / f.width : align === 'right' ? 1 - side / f.width : 0.5
  // Baseline: `margin` above the bottom edge, or one cap-height below `margin` from the top.
  const v = vertical === 'bottom' ? 1 - margin / f.height : (margin + fontSize * 0.7) / f.height
  drawVisualText(page, text, font, fontSize, u, v, { align, color: textColor })
}

// ── Page numbers ───────────────────────────────────────────────────────────

export async function addPageNumbers(doc: PDFDocument, params: PageNumberParams) {
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const selected = params.pages.length ? new Set(params.pages) : null
  const numbered = pages.filter((_, i) => !selected || selected.has(i + 1))
  const start = Number.isFinite(params.startAt) ? Math.trunc(params.startAt) : 1
  const total = start + numbered.length - 1
  const size = Math.min(Math.max(params.fontSize || 10, 6), 36)
  numbered.forEach((page, i) => {
    const label = encodable(font, fillTemplate(params.template || '{n}', start + i, total))
    if (label.trim()) drawMarginLabel(page, label, font, size, params.vertical, params.align, params.color)
  })
}

// ── Watermark ──────────────────────────────────────────────────────────────

async function embedImage(doc: PDFDocument, asset: ImageAsset): Promise<PDFImage> {
  return asset.type === 'png' ? doc.embedPng(asset.bytes) : doc.embedJpg(asset.bytes)
}

export async function addWatermark(doc: PDFDocument, params: WatermarkParams) {
  const pages = doc.getPages()
  const selected = params.pages.length ? new Set(params.pages) : null
  const opacity = Math.min(Math.max(params.opacity, 0.02), 1)
  let font: PDFFont | null = null
  let image: PDFImage | null = null
  let text = ''
  if (params.kind === 'text') {
    font = await doc.embedFont(params.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica)
    text = encodable(font, params.text.trim())
    if (!text) throw new Error('Enter the watermark text.')
  } else {
    if (!params.image) throw new Error('Choose an image for the watermark.')
    image = await embedImage(doc, params.image)
  }

  pages.forEach((page, i) => {
    if (selected && !selected.has(i + 1)) return
    const f = pageFrame(page)
    // On-screen angle plus the page's own turn gives the user-space angle.
    const angle = params.angle + f.rotation
    let w: number
    let h: number
    if (font) {
      w = font.widthOfTextAtSize(text, params.fontSize)
      h = font.heightAtSize(params.fontSize, { descender: false })
    } else {
      w = f.width * Math.min(Math.max(params.imageScale, 0.02), 1)
      h = (w * image!.height) / image!.width
    }

    const centers: [number, number][] = []
    if (params.layout === 'center') centers.push([0.5, 0.5])
    else {
      // Tile spacing follows the item's footprint so tiles don't overlap.
      const stepU = Math.min(1, (Math.max(w, h * 0.6) * 1.35) / f.width)
      const stepV = Math.min(1, (Math.max(h, w * 0.5) * 1.6) / f.height)
      for (let v = stepV / 2, row = 0; v < 1 + stepV / 2; v += stepV, row++) {
        for (let u = (row % 2 ? stepU : 0) - stepU / 2; u < 1 + stepU; u += stepU) centers.push([u, v])
      }
    }

    isolateExistingContent(page)
    for (const [u, v] of centers) {
      const anchor = anchorForCentered(f.map(u, v), w, h, angle)
      if (font) {
        page.drawText(text, {
          x: anchor.x,
          y: anchor.y,
          size: params.fontSize,
          font,
          color: color(params.color),
          opacity,
          rotate: degrees(angle),
        })
      } else {
        page.drawImage(image!, { x: anchor.x, y: anchor.y, width: w, height: h, opacity, rotate: degrees(angle) })
      }
    }
  })
}

// ── Annotations, drawings and signatures ───────────────────────────────────

/** Greedy word wrap to a width in points; respects explicit newlines. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const next = line + word
      if (line && font.widthOfTextAtSize(next.trimEnd(), size) > maxWidth && word.trim()) {
        lines.push(line.trimEnd())
        line = word.trimStart()
      } else line = next
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/** Axis-aligned user-space rectangle covering a visual-fraction box. */
function userRect(f: ReturnType<typeof pageFrame>, x: number, y: number, w: number, h: number) {
  const a = f.map(x, y)
  const b = f.map(x + w, y + h)
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export async function applyAnnotations(doc: PDFDocument, params: AnnotateParams) {
  const pages = doc.getPages()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const images = new Map<string, PDFImage>()
  for (const [id, asset] of Object.entries(params.images)) images.set(id, await embedImage(doc, asset))

  for (const obj of params.objects) {
    const page = pages[obj.page]
    if (!page) continue
    const f = pageFrame(page)
    isolateExistingContent(page)

    switch (obj.kind) {
      case 'highlight': {
        const r = userRect(f, obj.x, obj.y, obj.w, obj.h)
        page.drawRectangle({ ...r, color: color(obj.color), opacity: 0.4, blendMode: BlendMode.Multiply })
        break
      }
      case 'rect': {
        const r = userRect(f, obj.x, obj.y, obj.w, obj.h)
        page.drawRectangle({ ...r, borderColor: color(obj.color), borderWidth: obj.strokeWidth })
        break
      }
      case 'ellipse': {
        const c = f.map(obj.x + obj.w / 2, obj.y + obj.h / 2)
        const a = (obj.w * f.width) / 2
        const b = (obj.h * f.height) / 2
        const sideways = f.rotation % 180 !== 0
        page.drawEllipse({
          x: c.x,
          y: c.y,
          xScale: sideways ? b : a,
          yScale: sideways ? a : b,
          borderColor: color(obj.color),
          borderWidth: obj.strokeWidth,
        })
        break
      }
      case 'pen': {
        if (obj.points.length < 2) break
        const [first, ...rest] = obj.points.map(([u, v]) => f.map(u, v))
        page.pushOperators(
          pushGraphicsState(),
          setStrokingColor(color(obj.color)),
          setLineWidth(obj.strokeWidth),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
          moveTo(first.x, first.y),
          ...rest.map((p) => lineTo(p.x, p.y)),
          stroke(),
          popGraphicsState(),
        )
        break
      }
      case 'text': {
        const size = obj.fontSize
        const lineHeight = size * 1.2
        const pad = 2
        const lines = wrapText(encodable(font, obj.text), font, size, Math.max(1, obj.w * f.width - pad * 2))
        lines.forEach((line, i) => {
          if (!line) return
          const v = obj.y + (pad + size * 0.95 + i * lineHeight) / f.height
          drawVisualText(page, line, font, size, obj.x + pad / f.width, v, { color: obj.color })
        })
        break
      }
      case 'image': {
        const img = images.get(obj.imageId)
        if (!img) break
        // Anchor at the visual bottom-left; rotating by the page turn keeps it upright.
        const anchor = f.map(obj.x, obj.y + obj.h)
        page.drawImage(img, {
          x: anchor.x,
          y: anchor.y,
          width: obj.w * f.width,
          height: obj.h * f.height,
          rotate: degrees(f.rotation),
        })
        break
      }
      case 'note': {
        // A real PDF comment: viewers show an icon that opens the text.
        const p = f.map(obj.x, obj.y)
        const c = hexToRgb01(obj.color)
        const ctx = doc.context
        const annot = ctx.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [p.x, p.y - 22, p.x + 22, p.y],
          Contents: PDFHexString.fromText(obj.text),
          T: PDFString.of('PDF Stitch'),
          Name: 'Comment',
          C: [c.r, c.g, c.b],
          F: 4 | 16 | 8, // print, no-zoom, no-rotate
          Open: false,
          M: PDFString.fromDate(new Date()),
        })
        page.node.addAnnot(ctx.register(annot))
        break
      }
    }
  }
}

// ── Forms ──────────────────────────────────────────────────────────────────

export function readForm(doc: PDFDocument): FormInfo {
  const form = doc.getForm()
  const hasXfa = Boolean(doc.catalog.getAcroForm()?.dict.get(PDFName.of('XFA')))
  const pageRefs = doc.getPages().map((p) => p.ref)

  const fields: FormFieldInfo[] = form.getFields().map((field) => {
    const base = {
      name: field.getName(),
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
      options: [] as string[],
      multiline: false,
      multiSelect: false,
      page: null as number | null,
    }
    const widget = field.acroField.getWidgets()[0]
    const pRef = widget?.P()
    if (pRef) {
      const idx = pageRefs.findIndex((r) => r === pRef || r.toString() === pRef.toString())
      if (idx >= 0) base.page = idx + 1
    }
    if (base.page === null && widget) {
      // Some producers omit /P: find the page whose /Annots lists the widget.
      const ref = doc.context.getObjectRef(widget.dict)
      const idx = doc.getPages().findIndex((p) => p.node.Annots()?.asArray().some((a) => a === ref))
      if (idx >= 0) base.page = idx + 1
    }

    if (field instanceof PDFTextField) {
      return {
        ...base,
        type: 'text',
        value: field.getText() ?? '',
        multiline: field.isMultiline(),
        maxLength: field.getMaxLength(),
      }
    }
    if (field instanceof PDFCheckBox) return { ...base, type: 'checkbox', value: field.isChecked() }
    if (field instanceof PDFDropdown) {
      return { ...base, type: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions() }
    }
    if (field instanceof PDFRadioGroup) {
      return { ...base, type: 'radio', value: field.getSelected() ?? '', options: field.getOptions() }
    }
    if (field instanceof PDFOptionList) {
      return {
        ...base,
        type: 'optionlist',
        value: field.getSelected(),
        options: field.getOptions(),
        multiSelect: field.isMultiselect(),
      }
    }
    return { ...base, type: 'other', value: '' }
  })
  return { fields, hasXfa }
}

export async function fillForm(doc: PDFDocument, params: FillFormParams) {
  const form = doc.getForm()
  if (doc.catalog.getAcroForm()?.dict.get(PDFName.of('XFA'))) form.deleteXFA()
  const problems: string[] = []
  for (const [name, value] of Object.entries(params.values)) {
    const field = form.getFieldMaybe(name)
    if (!field || field.isReadOnly()) continue
    try {
      if (field instanceof PDFTextField && typeof value === 'string') field.setText(value || undefined)
      else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
        if (value) field.check()
        else field.uncheck()
      } else if (field instanceof PDFDropdown && typeof value === 'string') {
        if (value) field.select(value)
        else field.clear()
      } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
        if (value) field.select(value)
        else field.clear()
      } else if (field instanceof PDFOptionList && Array.isArray(value)) {
        if (value.length) field.select(value)
        else field.clear()
      }
    } catch (err) {
      problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  try {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    form.updateFieldAppearances(font)
  } catch {
    throw new Error(
      'Some text uses characters the standard PDF font cannot display (for example non-Latin scripts).',
    )
  }
  if (params.flatten) form.flatten()
  if (problems.length) throw new Error(`Could not set ${problems.join('; ')}`)
}

// ── Entry points ───────────────────────────────────────────────────────────

export async function loadForEdit(buffer: ArrayBuffer) {
  try {
    return await PDFDocument.load(new Uint8Array(buffer), LOAD_OPTIONS)
  } catch {
    throw new Error('The file could not be read.')
  }
}

export async function readFormInfo(buffer: ArrayBuffer): Promise<FormInfo> {
  return readForm(await loadForEdit(buffer))
}

/** Applies one edit to a PDF and returns the new file. */
export async function transformPdf(buffer: ArrayBuffer, op: TransformOp): Promise<Uint8Array> {
  const doc = await loadForEdit(buffer)
  switch (op.kind) {
    case 'pageNumbers':
      await addPageNumbers(doc, op.params)
      break
    case 'watermark':
      await addWatermark(doc, op.params)
      break
    case 'annotate':
      await applyAnnotations(doc, op.params)
      break
    case 'fillForm':
      await fillForm(doc, op.params)
      break
  }
  doc.setModificationDate(new Date())
  doc.setProducer('PDF Stitch (pdf-lib, in-browser)')
  return doc.save({ useObjectStreams: true })
}
