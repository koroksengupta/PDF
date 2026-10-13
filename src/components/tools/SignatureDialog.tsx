import { Eraser, PenLine, Type, Upload, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useToasts } from '../../hooks/useToasts'
import { canvasToImage, loadImageFile, type LoadedImage } from '../../lib/images'
import { Segmented } from './ToolFrame'
import { fieldLabel, inputClass } from './toolStyles'

/** Cursive faces that ship with common OSes; the browser picks the first available. */
const SCRIPT_FONTS = [
  { label: 'Script', css: "'Segoe Script', 'Snell Roundhand', 'Apple Chancery', 'URW Chancery L', cursive" },
  { label: 'Brush', css: "'Brush Script MT', 'Brush Script Std', 'Lucida Handwriting', cursive" },
  { label: 'Classic', css: "'Lucida Handwriting', 'Bradley Hand', 'Comic Sans MS', cursive" },
  { label: 'Serif', css: "Georgia, 'Times New Roman', serif" },
]
const INKS = ['#111827', '#1d4ed8']

/** Crops a canvas to the bounding box of its non-transparent pixels (plus padding). */
function trimCanvas(src: HTMLCanvasElement, pad = 8): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')!
  const { width, height } = src
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/** Makes near-white pixels transparent, for photographed or scanned signatures. */
function knockOutWhite(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    // Soft threshold keeps anti-aliased edges smooth.
    if (lum > 235) d[i + 3] = 0
    else if (lum > 180) d[i + 3] = Math.round(d[i + 3] * ((235 - lum) / 55))
  }
  ctx.putImageData(img, 0, 0)
}

export function SignatureDialog({
  saved,
  onUse,
  onClose,
}: {
  saved: LoadedImage[]
  onUse: (sig: LoadedImage, isNew: boolean) => void
  onClose: () => void
}) {
  const { push } = useToasts()
  const ids = { name: useId(), title: useId() }
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [ink, setInk] = useState(INKS[0])
  const [name, setName] = useState('')
  const [font, setFont] = useState(SCRIPT_FONTS[0].css)
  const [removeBg, setRemoveBg] = useState(true)
  const [upload, setUpload] = useState<File | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hasInk, setHasInk] = useState(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  const drawTo = (p: { x: number; y: number }, pressure: number) => {
    const ctx = canvas.current!.getContext('2d')!
    ctx.strokeStyle = ink
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 + 3 * (pressure || 0.5)
    ctx.beginPath()
    const from = last.current ?? p
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const clear = () => {
    const c = canvas.current
    c?.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  const create = async () => {
    try {
      let result: LoadedImage | null = null
      if (mode === 'draw') {
        const trimmed = trimCanvas(canvas.current!)
        if (!trimmed) throw new Error('Draw your signature first.')
        result = await canvasToImage(trimmed)
      } else if (mode === 'type') {
        if (!name.trim()) throw new Error('Type your name first.')
        const c = document.createElement('canvas')
        const size = 120
        const ctx = c.getContext('2d')!
        ctx.font = `${size}px ${font}`
        const width = Math.ceil(ctx.measureText(name).width) + size
        c.width = width
        c.height = Math.ceil(size * 1.8)
        ctx.font = `${size}px ${font}`
        ctx.fillStyle = ink
        ctx.textBaseline = 'middle'
        ctx.fillText(name, size / 2, c.height / 2)
        result = await canvasToImage(trimCanvas(c) ?? c)
      } else {
        if (!upload) throw new Error('Choose an image of your signature.')
        const loaded = await loadImageFile(upload, 1600)
        URL.revokeObjectURL(loaded.url)
        const bitmap = await createImageBitmap(new Blob([loaded.asset.bytes as Uint8Array<ArrayBuffer>]))
        const c = document.createElement('canvas')
        c.width = bitmap.width
        c.height = bitmap.height
        c.getContext('2d')!.drawImage(bitmap, 0, 0)
        bitmap.close()
        if (removeBg) knockOutWhite(c)
        result = await canvasToImage(removeBg ? (trimCanvas(c) ?? c) : c, removeBg ? 'png' : loaded.asset.type)
      }
      onUse(result, true)
    } catch (err) {
      push({ kind: 'error', title: 'Signature not created', description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={ids.title} className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={ids.title} className="text-lg font-semibold text-slate-900">Add a signature</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {saved.length > 0 && (
          <div className="mb-4">
            <span className={fieldLabel}>Use a signature from this session</span>
            <div className="flex flex-wrap gap-2">
              {saved.map((s) => (
                <button key={s.url} type="button" onClick={() => onUse(s, false)} className="h-14 rounded-lg bg-white px-3 ring-1 ring-slate-200 hover:ring-indigo-400">
                  <img src={s.url} alt="Saved signature" className="h-10 max-w-40 object-contain" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Segmented
          label="Signature type"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'draw', label: <><PenLine className="size-4" aria-hidden /> Draw</> },
            { value: 'type', label: <><Type className="size-4" aria-hidden /> Type</> },
            { value: 'upload', label: <><Upload className="size-4" aria-hidden /> Upload</> },
          ]}
        />

        <div className="mt-4 min-h-48">
          {mode === 'draw' && (
            <div>
              <canvas
                ref={canvas}
                width={1200}
                height={400}
                aria-label="Signature pad: draw with your mouse, finger or pen"
                className="block aspect-[3/1] w-full touch-none rounded-xl bg-slate-50 ring-1 ring-slate-200"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  last.current = null
                  drawTo(point(e), e.pressure)
                  setHasInk(true)
                }}
                onPointerMove={(e) => e.buttons && drawTo(point(e), e.pressure)}
                onPointerUp={() => (last.current = null)}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">Sign above with your mouse, finger or stylus.</p>
                <button type="button" onClick={clear} disabled={!hasInk} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  <Eraser className="size-4" aria-hidden /> Clear
                </button>
              </div>
            </div>
          )}
          {mode === 'type' && (
            <div className="space-y-3">
              <div>
                <label htmlFor={ids.name} className={fieldLabel}>Your name</label>
                <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus maxLength={60} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SCRIPT_FONTS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFont(f.css)}
                    aria-pressed={font === f.css}
                    className={`truncate rounded-lg px-3 py-2 text-2xl ring-1 ${font === f.css ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'ring-slate-200 hover:bg-slate-50'}`}
                    style={{ fontFamily: f.css, color: ink }}
                  >
                    {name || 'Your name'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === 'upload' && (
            <div className="space-y-3">
              <input type="file" accept="image/*" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700" aria-label="Signature image" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="size-4 accent-indigo-600" />
                Remove white background
              </label>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {mode !== 'upload' ? (
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Ink colour">
              <span className="text-xs text-slate-500">Ink</span>
              {INKS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={ink === c} aria-label={c === INKS[0] ? 'Black ink' : 'Blue ink'} onClick={() => setInk(c)} className={`size-6 rounded-full ring-offset-2 ${ink === c ? 'ring-2 ring-indigo-500' : 'ring-1 ring-black/10'}`} style={{ background: c }} />
              ))}
            </div>
          ) : <span />}
          <button type="button" onClick={() => void create()} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
            Use signature
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          This places an image of your signature on the page. It is not a certificate-based digital signature.
        </p>
      </div>
    </div>
  )
}
