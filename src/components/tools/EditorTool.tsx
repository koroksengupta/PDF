import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  Highlighter,
  ImagePlus,
  MessageSquare,
  MousePointer2,
  PenLine,
  PenTool,
  Redo2,
  Signature,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInView } from '../../hooks/useInView'
import { usePageSizes } from '../../hooks/usePageSizes'
import { useThumbnail } from '../../hooks/useThumbnail'
import { useToasts } from '../../hooks/useToasts'
import { useTransform } from '../../hooks/useTransform'
import type { EditObject, ImageAsset } from '../../lib/editTypes'
import { loadImageFile, type LoadedImage } from '../../lib/images'
import { PREVIEW_CSS_SIZE } from '../../lib/limits'
import type { SourceMeta } from '../../lib/types'
import { uid } from '../../state/workspace'
import { Thumbnail } from '../Thumbnail'
import { SignatureDialog } from './SignatureDialog'
import { ColorSwatches, Panel, ToolAction, ToolFrame, type ToolFrameProps } from './ToolFrame'
import { outputName } from './toolStyles'

type Tool = 'select' | 'text' | 'date' | 'highlight' | 'rect' | 'ellipse' | 'pen' | 'note' | 'signature' | 'image' | 'place'

const TOOLS: { id: Exclude<Tool, 'place'>; label: string; icon: typeof Type; hint: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'Select, move and resize items' },
  { id: 'text', label: 'Text', icon: Type, hint: 'Click to add a text box' },
  { id: 'date', label: 'Date', icon: CalendarDays, hint: "Click to stamp today's date" },
  { id: 'signature', label: 'Sign', icon: Signature, hint: 'Draw, type or upload a signature, then click to place it' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, hint: 'Drag over text to highlight it' },
  { id: 'pen', label: 'Draw', icon: PenLine, hint: 'Draw freehand' },
  { id: 'rect', label: 'Box', icon: Square, hint: 'Drag to draw a rectangle' },
  { id: 'ellipse', label: 'Circle', icon: Circle, hint: 'Drag to draw an ellipse' },
  { id: 'note', label: 'Note', icon: MessageSquare, hint: 'Click to add a sticky note (a PDF comment)' },
  { id: 'image', label: 'Image', icon: ImagePlus, hint: 'Choose an image, then click to place it' },
]

const HIGHLIGHTS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4']
const NOTE_PT = 22
type BoxObject = Extract<EditObject, { w: number }>
interface History {
  past: EditObject[][]
  present: EditObject[]
  future: EditObject[][]
}
const isBox = (o: EditObject): o is BoxObject => 'w' in o

export function EditorTool(props: ToolFrameProps) {
  return (
    <ToolFrame {...props} emptyTitle="Drop a PDF to edit or sign it">
      {(file) => <Editor file={file} onAddToFiles={props.onAddToFiles} />}
    </ToolFrame>
  )
}

interface Style {
  color: string
  highlight: string
  strokeWidth: number
  fontSize: number
}

function Editor({ file, onAddToFiles }: { file: SourceMeta; onAddToFiles: (f: File) => void }) {
  const { push } = useToasts()
  const sizes = usePageSizes(file.id, file.pageCount)
  const tool$ = useTransform('Changes saved')
  const [page, setPage] = useState(0)
  const [tool, setTool] = useState<Tool>('select')
  const [style, setStyle] = useState<Style>({ color: '#111827', highlight: HIGHLIGHTS[0], strokeWidth: 2, fontSize: 12 })
  const [hist, setHist] = useState<History>({ past: [], present: [], future: [] })
  const { present: objects, past, future } = hist
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, LoadedImage>>({})
  const [signatureIds, setSignatureIds] = useState<string[]>([])
  const [placing, setPlacing] = useState<string | null>(null)
  const [sigOpen, setSigOpen] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)

  // Revoke preview URLs of images when the editor goes away.
  const imagesRef = useRef(images)
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => () => Object.values(imagesRef.current).forEach((i) => URL.revokeObjectURL(i.url)), [])

  // ── History ──────────────────────────────────────────────────────────────
  // One state object for past/present/future, mirrored in a ref that is written on
  // every change, so rapid pointer events and keyboard shortcuts never see stale data.
  const histRef = useRef(hist)
  useEffect(() => {
    histRef.current = hist
  }, [hist])
  const apply = useCallback((next: History) => {
    histRef.current = next
    setHist(next)
  }, [])
  const setObjectsNow = useCallback((present: EditObject[]) => apply({ ...histRef.current, present }), [apply])
  const commit = useCallback(
    (next: EditObject[], before = histRef.current.present) => {
      const h = histRef.current
      apply({ past: [...h.past.slice(-99), before], present: next, future: [] })
    },
    [apply],
  )
  const undo = useCallback(() => {
    const h = histRef.current
    if (!h.past.length) return
    apply({ past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] })
    setEditing(null)
  }, [apply])
  const redo = useCallback(() => {
    const h = histRef.current
    if (!h.future.length) return
    apply({ past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) })
  }, [apply])
  const update = useCallback((id: string, patch: Partial<EditObject>, live = false) => {
    const next = histRef.current.present.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))
    if (live) setObjectsNow(next)
    else commit(next)
  }, [commit, setObjectsNow])
  // Typing updates the item live; the whole editing session becomes one undo step
  // when editing ends (however it ends: click elsewhere, Esc, switching tools…).
  const editSession = useRef<{ id: string; before: EditObject[] } | null>(null)
  useEffect(() => {
    const session = editSession.current
    if (session && session.id !== editing) {
      const h = histRef.current
      if (JSON.stringify(session.before) !== JSON.stringify(h.present)) {
        apply({ past: [...h.past.slice(-99), session.before], present: h.present, future: [] })
      }
      editSession.current = null
    }
    if (editing && !editSession.current) editSession.current = { id: editing, before: histRef.current.present }
  }, [editing, apply])

  const remove = useCallback((id: string) => {
    commit(histRef.current.present.filter((o) => o.id !== id))
    setSelected(null)
    setEditing(null)
  }, [commit])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"], [role=dialog]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        remove(selected)
      } else if (e.key === 'Escape') {
        setSelected(null)
        setEditing(null)
        setPlacing(null)
        setTool('select')
      } else if (selected && e.key.startsWith('Arrow')) {
        const o = histRef.current.present.find((x) => x.id === selected)
        if (!o || o.kind === 'pen') return
        e.preventDefault()
        const step = e.shiftKey ? 0.02 : 0.004
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        update(o.id, { x: o.x + dx, y: o.y + dy })
      }
    }
    // The editor lives inside a hidden tool view when inactive; only react while visible.
    const handler = (e: KeyboardEvent) => {
      const el = document.querySelector('[data-editor-active="true"]')
      if (el && el.getClientRects().length > 0) onKey(e)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [redo, remove, selected, undo, update])

  const pickTool = (t: Exclude<Tool, 'place'>) => {
    setSelected(null)
    setEditing(null)
    setPlacing(null)
    if (t === 'signature') {
      setSigOpen(true)
      return
    }
    if (t === 'image') {
      imageInput.current?.click()
      return
    }
    setTool(t)
  }

  const addImage = (img: LoadedImage, asSignature: boolean) => {
    const id = uid('img')
    setImages((all) => ({ ...all, [id]: img }))
    if (asSignature) setSignatureIds((s) => [...s, id])
    setPlacing(id)
    setTool('place')
    return id
  }

  const pageSize = sizes[page] ?? { width: 612, height: 792 }
  const pageObjects = useMemo(() => objects.filter((o) => o.page === page), [objects, page])
  const counts = useMemo(() => {
    const c = new Map<number, number>()
    for (const o of objects) c.set(o.page, (c.get(o.page) ?? 0) + 1)
    return c
  }, [objects])

  const signature = JSON.stringify(objects)
  const save = () => {
    const used = new Set(objects.flatMap((o) => (o.kind === 'image' ? [o.imageId] : [])))
    const assets: Record<string, ImageAsset> = {}
    for (const id of used) if (images[id]) assets[id] = images[id].asset
    // Drop empty text and notes rather than writing blank items.
    const clean = objects.filter((o) => !((o.kind === 'text' || o.kind === 'note') && !o.text.trim()))
    void tool$.run(file.id, { kind: 'annotate', params: { objects: clean, images: assets } }, outputName(file, 'edited'), signature)
  }

  const activeHint = tool === 'place' ? 'Click on the page to place it. Press Esc to cancel.' : TOOLS.find((t) => t.id === tool)?.hint

  return (
    <div data-editor-active="true" className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-[65px] z-10 -mx-1 flex flex-wrap items-center gap-1 rounded-2xl bg-white/95 p-1.5 shadow-sm ring-1 ring-slate-200 backdrop-blur" role="toolbar" aria-label="Editing tools">
        {TOOLS.map(({ id, label, icon: Icon, hint }) => {
          const active = tool === id || (id === 'signature' && tool === 'place' && placing !== null && signatureIds.includes(placing)) || (id === 'image' && tool === 'place' && placing !== null && !signatureIds.includes(placing))
          return (
            <button
              key={id}
              type="button"
              onClick={() => pickTool(id)}
              aria-pressed={active}
              title={hint}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden md:inline">{label}</span>
            </button>
          )
        })}
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
        <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Undo2 className="size-4" aria-hidden /></button>
        <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Redo2 className="size-4" aria-hidden /></button>
        <button type="button" onClick={() => selected && remove(selected)} disabled={!selected} aria-label="Delete selected" title="Delete (Del)" className="rounded-lg p-2 text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" aria-hidden /></button>
        <input ref={imageInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            addImage(await loadImageFile(f), false)
          } catch (err) {
            push({ kind: 'error', title: 'Image not supported', description: err instanceof Error ? err.message : String(err) })
          }
        }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[140px_minmax(0,1fr)_280px] lg:items-start">
        {/* Page list */}
        <nav aria-label="Pages" className="hidden max-h-[calc(100vh-170px)] space-y-3 overflow-y-auto pr-1 lg:sticky lg:top-[130px] lg:block">
          {Array.from({ length: file.pageCount }, (_, i) => (
            <button key={i} type="button" onClick={() => setPage(i)} aria-current={page === i} className="group block w-full text-left">
              <div className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-white p-1 ring-2 transition ${page === i ? 'ring-indigo-500' : 'ring-transparent group-hover:ring-slate-300'}`}>
                <Thumbnail sourceId={file.id} index={i} rotation={0} cssSize={120} className="size-full" />
                {counts.get(i) ? <span className="absolute right-1 top-1 rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">{counts.get(i)}</span> : null}
              </div>
              <p className="mt-1 text-center text-xs text-slate-500">{i + 1}</p>
            </button>
          ))}
        </nav>

        {/* Stage */}
        <section aria-label={`Page ${page + 1}`} className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-600">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Prev</span></button>
            <span className="min-w-0 truncate text-center text-xs sm:text-sm">Page {page + 1} of {file.pageCount} · <span className="text-slate-500">{activeHint}</span></span>
            <button type="button" onClick={() => setPage((p) => Math.min(file.pageCount - 1, p + 1))} disabled={page === file.pageCount - 1} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white disabled:opacity-30" aria-label="Next page"><span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" aria-hidden /></button>
          </div>
          <Stage
            key={page}
            sourceId={file.id}
            page={page}
            size={pageSize}
            objects={pageObjects}
            images={images}
            tool={tool}
            style={style}
            placing={placing}
            selected={selected}
            editing={editing}
            onSelect={setSelected}
            onEdit={setEditing}
            onCreate={(o) => {
              commit([...histRef.current.present, o])
              setSelected(o.id)
              if (o.kind === 'text' || o.kind === 'note') setEditing(o.id)
              if (o.kind !== 'pen' && o.kind !== 'highlight') setTool('select')
              if (o.kind === 'image') setPlacing(null)
            }}
            onUpdate={update}
            onGestureEnd={(before) => commit(histRef.current.present, before)}
            snapshot={() => histRef.current.present}
          />
        </section>

        {/* Properties & save */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[130px]">
          <Panel title="Style" icon={<PenTool />}>
            <StyleControls
              tool={tool}
              selectedObject={objects.find((o) => o.id === selected) ?? null}
              style={style}
              onStyle={(patch) => {
                setStyle((s) => ({ ...s, ...patch }))
                // Apply to the selected item as well.
                const o = objects.find((x) => x.id === selected)
                if (!o) return
                if (patch.color && o.kind !== 'highlight' && o.kind !== 'image') update(o.id, { color: patch.color })
                if (patch.highlight && o.kind === 'highlight') update(o.id, { color: patch.highlight })
                if (patch.strokeWidth && (o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'pen')) update(o.id, { strokeWidth: patch.strokeWidth })
                if (patch.fontSize && o.kind === 'text') update(o.id, { fontSize: patch.fontSize })
              }}
            />
          </Panel>
          {/* On phones, Save comes first so it's reachable without scrolling past the style panel. */}
          <div className="order-first lg:order-none">
          <Panel title="Save" icon={<Signature />}>
            <p className="text-sm text-slate-600">
              {objects.length === 0 ? 'Add text, a signature or drawings, then save a new PDF.' : `${objects.length} item${objects.length === 1 ? '' : 's'} on ${counts.size} page${counts.size === 1 ? '' : 's'}.`}
            </p>
            <ToolAction
              label="Save edited PDF"
              icon={<Signature className="size-5" aria-hidden />}
              status={tool$.status}
              disabledReason={objects.length === 0 ? 'Nothing to save yet.' : null}
              stale={tool$.status.state === 'done' && tool$.status.signature !== signature}
              onRun={save}
              onCancel={tool$.cancel}
              onDismiss={tool$.dismiss}
              onAddToFiles={onAddToFiles}
            />
          </Panel>
          </div>
        </aside>
      </div>

      {sigOpen && (
        <SignatureDialog
          saved={signatureIds.map((id) => images[id]).filter(Boolean)}
          onClose={() => setSigOpen(false)}
          onUse={(sig, isNew) => {
            setSigOpen(false)
            if (isNew) addImage(sig, true)
            else {
              const id = signatureIds.find((sid) => images[sid] === sig)
              if (id) {
                setPlacing(id)
                setTool('place')
              }
            }
          }}
        />
      )}
    </div>
  )
}

function StyleControls({
  tool,
  selectedObject,
  style,
  onStyle,
}: {
  tool: Tool
  selectedObject: EditObject | null
  style: Style
  onStyle: (patch: Partial<Style>) => void
}) {
  const kind = selectedObject?.kind ?? tool
  if (kind === 'image' || kind === 'signature' || kind === 'place') {
    return <p className="text-sm text-slate-500">Drag the corner handle to resize. Images keep their proportions.</p>
  }
  if (kind === 'select') return <p className="text-sm text-slate-500">Select an item to change its style, or pick a tool above.</p>
  const textHint = kind === 'text' && selectedObject ? <p className="text-xs text-slate-500">Double-click the text box to edit its text.</p> : null
  return (
    <div className="space-y-3">
      {kind === 'highlight' ? (
        <ColorSwatches value={style.highlight} onChange={(highlight) => onStyle({ highlight })} colors={HIGHLIGHTS} />
      ) : (
        <ColorSwatches value={style.color} onChange={(color) => onStyle({ color })} />
      )}
      {(kind === 'rect' || kind === 'ellipse' || kind === 'pen') && (
        <label className="block text-xs font-medium text-slate-600">
          Line width: {style.strokeWidth} pt
          <input type="range" min={0.5} max={10} step={0.5} value={style.strokeWidth} onChange={(e) => onStyle({ strokeWidth: Number(e.target.value) })} className="mt-1 w-full accent-indigo-600" />
        </label>
      )}
      {(kind === 'text' || kind === 'date') && (
        <label className="block text-xs font-medium text-slate-600">
          Font size
          <select value={style.fontSize} onChange={(e) => onStyle({ fontSize: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {[8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48].map((s) => <option key={s} value={s}>{s} pt</option>)}
          </select>
        </label>
      )}
      {textHint}
    </div>
  )
}

interface StageProps {
  sourceId: string
  page: number
  size: { width: number; height: number }
  objects: EditObject[]
  images: Record<string, LoadedImage>
  tool: Tool
  style: Style
  placing: string | null
  selected: string | null
  editing: string | null
  onSelect: (id: string | null) => void
  onEdit: (id: string | null) => void
  onCreate: (o: EditObject) => void
  onUpdate: (id: string, patch: Partial<EditObject>, live?: boolean) => void
  onGestureEnd: (before: EditObject[]) => void
  snapshot: () => EditObject[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const todayLabel = () => new Date().toLocaleDateString()

/** One page with its editable overlay. Coordinates are fractions of the page as shown. */
const Stage = memo(function Stage(props: StageProps) {
  const { sourceId, page, size, objects, images, tool, style, placing, selected, editing } = props
  const stage = useRef<HTMLDivElement>(null)
  const inView = useInView(stage, '0px')
  const thumb = useThumbnail(sourceId, page, PREVIEW_CSS_SIZE, inView)
  const [px, setPx] = useState(1) // CSS pixels per point
  const [draft, setDraft] = useState<EditObject | null>(null)
  const gesture = useRef<{ start: [number, number]; before: EditObject[]; origin?: EditObject; mode: 'move' | 'resize' | 'create' } | null>(null)

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setPx(el.clientWidth / size.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [size.width])

  const toUV = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = stage.current!.getBoundingClientRect()
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]
  }
  const aspect = size.width / size.height

  // ── Creating items on empty page area ─────────────────────────────────────
  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const [u, v] = toUV(e)
    const base = { id: uid('obj'), page }
    switch (tool) {
      case 'select':
        props.onSelect(null)
        props.onEdit(null)
        return
      case 'text':
      case 'date': {
        const text = tool === 'date' ? todayLabel() : ''
        const h = (style.fontSize * 1.2 + 6) / size.height
        props.onCreate({ ...base, kind: 'text', x: u, y: Math.min(v, 1 - h), w: Math.min(tool === 'date' ? 0.2 : 0.35, 1 - u), h, text, fontSize: style.fontSize, color: style.color })
        return
      }
      case 'note':
        props.onCreate({ ...base, kind: 'note', x: Math.min(u, 1 - NOTE_PT / size.width), y: v, text: '', color: '#facc15' })
        return
      case 'place': {
        const img = placing ? images[placing] : null
        if (!img) return
        const w = Math.min(0.3, 0.9)
        const h = (w * size.width * img.height) / img.width / size.height
        props.onCreate({ ...base, kind: 'image', x: clamp01(u - w / 2), y: clamp01(v - h / 2), w, h, imageId: placing! })
        return
      }
      case 'pen':
      case 'rect':
      case 'ellipse':
      case 'highlight': {
        e.currentTarget.setPointerCapture(e.pointerId)
        gesture.current = { start: [u, v], before: props.snapshot(), mode: 'create' }
        if (tool === 'pen') setDraft({ ...base, kind: 'pen', points: [[u, v]], color: style.color, strokeWidth: style.strokeWidth })
        else if (tool === 'highlight') setDraft({ ...base, kind: 'highlight', x: u, y: v, w: 0, h: 0, color: style.highlight })
        else setDraft({ ...base, kind: tool, x: u, y: v, w: 0, h: 0, color: style.color, strokeWidth: style.strokeWidth })
        return
      }
    }
  }
  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.mode !== 'create' || !draft) return
    const [u, v] = toUV(e)
    if (draft.kind === 'pen') {
      const [lu, lv] = draft.points[draft.points.length - 1]
      if (Math.hypot(u - lu, (v - lv) / aspect) > 0.002) setDraft({ ...draft, points: [...draft.points, [u, v]] })
    } else if (isBox(draft)) {
      const [su, sv] = g.start
      setDraft({ ...draft, x: Math.min(su, u), y: Math.min(sv, v), w: Math.abs(u - su), h: Math.abs(v - sv) })
    }
  }
  const onBackgroundUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.mode !== 'create' || !draft) return
    setDraft(null)
    if (draft.kind === 'pen') {
      if (draft.points.length > 1) props.onCreate(draft)
      return
    }
    if (!isBox(draft)) return
    // A click without a drag gets a sensible default size.
    if (draft.w < 0.01 || draft.h < 0.005) {
      const w = draft.kind === 'highlight' ? 0.25 : 0.2
      const h = draft.kind === 'highlight' ? 16 / size.height : 0.1
      props.onCreate({ ...draft, w: Math.min(w, 1 - draft.x), h: Math.min(h, 1 - draft.y) })
    } else props.onCreate(draft)
  }

  // ── Moving / resizing existing items ──────────────────────────────────────
  const startGesture = (e: ReactPointerEvent, o: EditObject, mode: 'move' | 'resize') => {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    props.onSelect(o.id)
    if (editing !== o.id) props.onEdit(null)
    gesture.current = { start: toUV(e), before: props.snapshot(), origin: o, mode }
  }
  const onItemMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || !g.origin || g.mode === 'create') return
    const [u, v] = toUV(e)
    const du = u - g.start[0]
    const dv = v - g.start[1]
    const o = g.origin
    if (g.mode === 'move') {
      if (o.kind === 'pen') {
        props.onUpdate(o.id, { points: o.points.map(([pu, pv]) => [pu + du, pv + dv] as [number, number]) }, true)
      } else {
        const w = isBox(o) ? o.w : NOTE_PT / size.width
        const h = isBox(o) ? o.h : NOTE_PT / size.height
        props.onUpdate(o.id, { x: Math.min(Math.max(o.x + du, 0), 1 - w), y: Math.min(Math.max(o.y + dv, 0), 1 - h) }, true)
      }
    } else if (isBox(o)) {
      let w = Math.max(0.02, Math.min(o.w + du, 1 - o.x))
      let h = Math.max(0.01, Math.min(o.h + dv, 1 - o.y))
      if (o.kind === 'image') {
        // Keep proportions: derive height from width in page units.
        const ratio = (o.h * size.height) / (o.w * size.width)
        h = (w * size.width * ratio) / size.height
        if (o.y + h > 1) {
          h = 1 - o.y
          w = (h * size.height) / ratio / size.width
        }
      }
      props.onUpdate(o.id, { w, h }, true)
    }
  }
  const onItemUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.mode === 'create') return
    const moved = JSON.stringify(props.snapshot()) !== JSON.stringify(g.before)
    if (moved) props.onGestureEnd(g.before)
  }

  const drawing = tool !== 'select'
  const all = draft ? [...objects, draft] : objects

  return (
    <div
      ref={stage}
      className={`relative mx-auto select-none overflow-hidden bg-white shadow-lg ring-1 ring-slate-200 ${drawing ? 'touch-none' : ''}`}
      style={{ aspectRatio: String(aspect), width: `min(100%, calc((100vh - 300px) * ${aspect}))` }}
    >
      {thumb?.status === 'ready' ? (
        <img src={thumb.url} alt={`Page ${page + 1}`} draggable={false} className="absolute inset-0 size-full" />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-slate-100" />
      )}

      {/* Background: creates new items. */}
      <div
        className={`absolute inset-0 ${tool === 'select' ? 'cursor-default' : tool === 'text' || tool === 'date' ? 'cursor-text' : 'cursor-crosshair'}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        data-testid="editor-stage"
      />

      {/* Freehand strokes */}
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        {all.map((o) =>
          o.kind === 'pen' ? (
            <polyline
              key={o.id}
              points={o.points.map(([u, v]) => `${u},${v}`).join(' ')}
              fill="none"
              stroke={o.color}
              strokeWidth={o.strokeWidth * px}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
      </svg>

      {all.map((o) => (
        <Item
          key={o.id}
          o={o}
          px={px}
          size={size}
          image={o.kind === 'image' ? images[o.imageId] : undefined}
          interactive={tool === 'select' && o !== draft}
          selected={selected === o.id}
          editing={editing === o.id}
          onPointerDown={(e, mode) => startGesture(e, o, mode)}
          onPointerMove={onItemMove}
          onPointerUp={onItemUp}
          onStartEdit={() => props.onEdit(o.id)}
          onText={(text, h) => props.onUpdate(o.id, h === undefined ? { text } : { text, h }, true)}
        />
      ))}
    </div>
  )
})

function Item({
  o,
  px,
  size,
  image,
  interactive,
  selected,
  editing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onStartEdit,
  onText,
}: {
  o: EditObject
  px: number
  size: { width: number; height: number }
  image?: LoadedImage
  interactive: boolean
  selected: boolean
  editing: boolean
  onPointerDown: (e: ReactPointerEvent, mode: 'move' | 'resize') => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: () => void
  onStartEdit: () => void
  onText: (text: string, h?: number) => void
}) {
  const pct = (n: number) => `${n * 100}%`
  const events = {
    onPointerDown: (e: ReactPointerEvent) => onPointerDown(e, 'move'),
    onPointerMove,
    onPointerUp,
  }
  const ring = selected ? 'outline outline-2 outline-offset-2 outline-indigo-500' : interactive ? 'hover:outline hover:outline-1 hover:outline-indigo-300' : ''
  const pointer = interactive ? 'pointer-events-auto cursor-move' : 'pointer-events-none'

  if (o.kind === 'pen') {
    // Strokes render in the SVG layer; this is just an invisible hit area for selecting.
    const us = o.points.map((p) => p[0])
    const vs = o.points.map((p) => p[1])
    const x = Math.min(...us), y = Math.min(...vs)
    const pad = 0.006
    return (
      <div
        {...events}
        aria-label="Drawing"
        className={`absolute ${pointer} ${selected ? 'outline-dashed outline-2 outline-indigo-500' : ''}`}
        style={{ left: pct(x - pad), top: pct(y - pad), width: pct(Math.max(...us) - x + pad * 2), height: pct(Math.max(...vs) - y + pad * 2) }}
      />
    )
  }

  if (o.kind === 'note') {
    const s = NOTE_PT * px
    return (
      <div className={`absolute ${pointer}`} style={{ left: pct(o.x), top: pct(o.y), width: s, height: s }}>
        <div {...events} onDoubleClick={onStartEdit} aria-label="Sticky note" className={`flex size-full items-center justify-center rounded-md shadow ${ring}`} style={{ background: o.color }}>
          <MessageSquare className="size-3/5 text-amber-900" aria-hidden />
        </div>
        {(editing || selected) && (
          <div className="pointer-events-auto absolute left-full top-0 z-10 ml-2 w-56 rounded-xl bg-amber-50 p-2 shadow-xl ring-1 ring-amber-200" onPointerDown={(e) => e.stopPropagation()}>
            <TextInput
              initial={o.text}
              autoFocus={editing}
              onInput={(text) => onText(text)}
              placeholder="Write a note…"
              aria-label="Note text"
              rows={4}
              className="w-full resize-none rounded-md bg-white p-2 text-sm outline-none ring-1 ring-amber-200 focus:ring-amber-400"
            />
            <p className="mt-1 text-[10px] text-amber-800">Shown as a comment in PDF viewers.</p>
          </div>
        )}
      </div>
    )
  }

  const box = { left: pct(o.x), top: pct(o.y), width: pct(o.w), height: pct(o.h) }
  const handle = selected && interactive && (
    <span
      onPointerDown={(e) => onPointerDown(e, 'resize')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Resize"
      className="pointer-events-auto absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-indigo-600 shadow"
    />
  )

  if (o.kind === 'text') {
    const textStyle = {
      fontSize: o.fontSize * px,
      lineHeight: 1.2,
      color: o.color,
      padding: 2 * px,
      fontFamily: 'Helvetica, Arial, sans-serif',
    }
    return (
      <div className={`absolute ${editing ? 'pointer-events-auto' : pointer} ${ring}`} style={box} {...(editing ? {} : events)} onDoubleClick={onStartEdit}>
        {editing ? (
          <TextInput
            initial={o.text}
            autoFocus
            grow
            onInput={(text, scrollHeight) => {
              // Keep the box tall enough for its content (stage height = page height × scale).
              const h = Math.min(1 - o.y, Math.max(o.h, scrollHeight / (size.height * px)))
              onText(text, h)
            }}
            placeholder="Type here"
            aria-label="Text box"
            className="block size-full min-h-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-indigo-50/40 outline-none"
            style={textStyle}
          />
        ) : (
          <div className="size-full whitespace-pre-wrap break-words" style={textStyle}>
            {o.text || <span className="text-slate-400">Type here</span>}
          </div>
        )}
        {!editing && handle}
      </div>
    )
  }

  if (o.kind === 'image') {
    return (
      <div {...events} aria-label="Image" className={`absolute ${pointer} ${ring}`} style={box}>
        {image && <img src={image.url} alt="" draggable={false} className="size-full" />}
        {handle}
      </div>
    )
  }

  const shape =
    o.kind === 'highlight'
      ? { background: o.color, opacity: 0.4, mixBlendMode: 'multiply' as const }
      : { border: `${Math.max(1, o.strokeWidth * px)}px solid ${o.color}`, borderRadius: o.kind === 'ellipse' ? '50%' : 0 }
  return (
    <div {...events} aria-label={o.kind === 'highlight' ? 'Highlight' : o.kind === 'rect' ? 'Box' : 'Circle'} className={`absolute ${pointer} ${ring}`} style={box}>
      <div className="size-full" style={shape} />
      {handle}
    </div>
  )
}

/**
 * Textarea that keeps its own draft and reports every change. Saving on each input,
 * rather than on blur, matters: clicking elsewhere unmounts it before blur would fire.
 */
function TextInput({
  initial,
  onInput,
  grow = false,
  ...rest
}: {
  initial: string
  onInput: (text: string, scrollHeight: number) => void
  grow?: boolean
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onInput'>) {
  const [text, setText] = useState(initial)
  return (
    <textarea
      {...rest}
      value={text}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const el = e.currentTarget
        setText(el.value)
        if (grow) {
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
        }
        onInput(el.value, el.scrollHeight)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
}
