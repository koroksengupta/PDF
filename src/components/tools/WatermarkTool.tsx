import { Droplets, ImagePlus, Type } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePageSizes } from '../../hooks/usePageSizes'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useToasts } from '../../hooks/useToasts'
import { useTransform } from '../../hooks/useTransform'
import { parsePageList } from '../../lib/geometry'
import { loadImageFile, type LoadedImage } from '../../lib/images'
import type { SourceMeta } from '../../lib/types'
import { ColorSwatches, Panel, Segmented, ToolAction, ToolFrame, type ToolFrameProps } from './ToolFrame'
import { fieldLabel, inputClass, outputName } from './toolStyles'
import { PagePreviewBox } from './PagePreviewBox'
import { cqw } from './toolStyles'

interface Settings {
  kind: 'text' | 'image'
  text: string
  fontSize: number
  bold: boolean
  color: string
  opacity: number
  angle: number
  layout: 'center' | 'tile'
  imageScale: number
}
const DEFAULTS: Settings = {
  kind: 'text',
  text: 'CONFIDENTIAL',
  fontSize: 60,
  bold: true,
  color: '#dc2626',
  opacity: 0.25,
  angle: 45,
  layout: 'center',
  imageScale: 0.4,
}
const isSettings = (v: unknown): v is Settings =>
  !!v && typeof v === 'object' && typeof (v as Settings).text === 'string' && typeof (v as Settings).opacity === 'number'

export function WatermarkTool(props: ToolFrameProps) {
  return (
    <ToolFrame {...props} emptyTitle="Drop a PDF to watermark it">
      {(file) => <WatermarkBody file={file} onAddToFiles={props.onAddToFiles} />}
    </ToolFrame>
  )
}

function WatermarkBody({ file, onAddToFiles }: { file: SourceMeta; onAddToFiles: (f: File) => void }) {
  const ids = { text: useId(), size: useId(), opacity: useId(), angle: useId(), scale: useId(), pages: useId() }
  const { push } = useToasts()
  const [s, setS] = usePersistentState('pdf-stitch:watermark:v1', DEFAULTS, isSettings)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [pagesText, setPagesText] = useState('')
  const imageInput = useRef<HTMLInputElement>(null)
  const sizes = usePageSizes(file.id, file.pageCount)
  const tool = useTransform('Watermark added')
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url)
  }, [image])

  const parsed = useMemo(() => parsePageList(pagesText, file.pageCount), [pagesText, file.pageCount])
  const signature = JSON.stringify([s, pagesText, image?.url])
  const disabledReason =
    'error' in parsed
      ? 'Fix the page list to continue.'
      : s.kind === 'text' && !s.text.trim()
        ? 'Enter the watermark text.'
        : s.kind === 'image' && !image
          ? 'Choose an image.'
          : null

  const run = () =>
    tool.run(
      file.id,
      {
        kind: 'watermark',
        params: {
          ...s,
          image: s.kind === 'image' ? image?.asset : undefined,
          pages: pagesText.trim() && 'pages' in parsed ? parsed.pages : [],
        },
      },
      outputName(file, 'watermarked'),
      signature,
    )

  const pickImage = async (f: File | undefined) => {
    if (!f) return
    try {
      setImage(await loadImageFile(f))
      set({ kind: 'image' })
    } catch (err) {
      push({ kind: 'error', title: 'Image not supported', description: err instanceof Error ? err.message : String(err) })
    }
  }

  const previewIndex = 'pages' in parsed && parsed.pages.length ? parsed.pages[0] - 1 : 0
  const size = sizes[previewIndex]
  const width = size?.width ?? 612
  const height = size?.height ?? 792

  // Approximates the output with CSS (same font metrics family, angle, opacity, layout).
  const mark = (key: string, style: React.CSSProperties = {}) =>
    s.kind === 'text' ? (
      <span
        key={key}
        className="absolute whitespace-nowrap font-[Helvetica,Arial,sans-serif] leading-none"
        style={{
          fontSize: cqw(s.fontSize, width),
          fontWeight: s.bold ? 700 : 400,
          color: s.color,
          opacity: s.opacity,
          transform: `translate(-50%, -50%) rotate(${-s.angle}deg)`,
          ...style,
        }}
      >
        {s.text}
      </span>
    ) : image ? (
      <img
        key={key}
        src={image.url}
        alt=""
        className="absolute max-w-none"
        style={{ width: `${s.imageScale * 100}%`, opacity: s.opacity, transform: `translate(-50%, -50%) rotate(${-s.angle}deg)`, ...style }}
      />
    ) : null

  const tiles = useMemo(() => {
    if (s.layout === 'center') return [[0.5, 0.5]]
    const w = s.kind === 'text' ? s.text.length * s.fontSize * 0.6 : width * s.imageScale
    const h = s.kind === 'text' ? s.fontSize * 0.7 : image ? (width * s.imageScale * image.height) / image.width : 50
    const stepU = Math.min(1, (Math.max(w, h * 0.6) * 1.35) / width)
    const stepV = Math.min(1, (Math.max(h, w * 0.5) * 1.6) / height)
    const out: [number, number][] = []
    for (let v = stepV / 2, row = 0; v < 1 + stepV / 2; v += stepV, row++)
      for (let u = (row % 2 ? stepU : 0) - stepU / 2; u < 1 + stepU; u += stepU) out.push([u, v])
    return out
  }, [s, width, height, image])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section aria-label="Preview" className="rounded-2xl bg-slate-200/60 p-4 sm:p-6">
        <p className="mb-3 text-xs font-medium text-slate-500">Preview of page {previewIndex + 1}</p>
        <PagePreviewBox sourceId={file.id} index={previewIndex} size={size} cssSize={520} className="mx-auto max-w-md">
          {tiles.map(([u, v], i) => mark(String(i), { left: `${u * 100}%`, top: `${v * 100}%` }))}
        </PagePreviewBox>
      </section>

      <aside className="lg:sticky lg:top-20">
        <Panel title="Watermark" icon={<Droplets />}>
          <Segmented
            label="Watermark type"
            value={s.kind}
            onChange={(kind) => (kind === 'image' && !image ? imageInput.current?.click() : set({ kind }))}
            options={[
              { value: 'text', label: <><Type className="size-4" aria-hidden /> Text</> },
              { value: 'image', label: <><ImagePlus className="size-4" aria-hidden /> Image</> },
            ]}
          />
          <input ref={imageInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = '' }} />

          {s.kind === 'text' ? (
            <>
              <div>
                <label htmlFor={ids.text} className={fieldLabel}>Text</label>
                <input id={ids.text} value={s.text} onChange={(e) => set({ text: e.target.value })} className={inputClass} maxLength={80} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={ids.size} className={fieldLabel}>Size</label>
                  <select id={ids.size} value={s.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} className={inputClass}>
                    {[16, 24, 32, 40, 48, 60, 72, 96, 120].map((n) => <option key={n} value={n}>{n} pt</option>)}
                  </select>
                </div>
                <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={s.bold} onChange={(e) => set({ bold: e.target.checked })} className="size-4 accent-indigo-600" /> Bold
                </label>
              </div>
              <div>
                <span className={fieldLabel}>Colour</span>
                <ColorSwatches value={s.color} onChange={(color) => set({ color })} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {image && <img src={image.url} alt="Watermark" className="size-14 rounded-lg bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:12px_12px] object-contain ring-1 ring-slate-200" />}
              <button type="button" onClick={() => imageInput.current?.click()} className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-slate-300 hover:bg-indigo-50">
                {image ? 'Change image' : 'Choose image'}
              </button>
            </div>
          )}
          {s.kind === 'image' && (
            <div>
              <label htmlFor={ids.scale} className={fieldLabel}>Width: {Math.round(s.imageScale * 100)}% of page</label>
              <input id={ids.scale} type="range" min={0.05} max={1} step={0.05} value={s.imageScale} onChange={(e) => set({ imageScale: Number(e.target.value) })} className="w-full accent-indigo-600" />
            </div>
          )}

          <div>
            <label htmlFor={ids.opacity} className={fieldLabel}>Opacity: {Math.round(s.opacity * 100)}%</label>
            <input id={ids.opacity} type="range" min={0.05} max={1} step={0.05} value={s.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="w-full accent-indigo-600" />
          </div>
          <div>
            <label htmlFor={ids.angle} className={fieldLabel}>Angle: {s.angle}°</label>
            <div className="flex items-center gap-2">
              <input id={ids.angle} type="range" min={-90} max={90} step={5} value={s.angle} onChange={(e) => set({ angle: Number(e.target.value) })} className="w-full accent-indigo-600" />
              {[0, 45, -45].map((a) => (
                <button key={a} type="button" onClick={() => set({ angle: a })} className={`rounded-md px-2 py-1 text-xs ring-1 ${s.angle === a ? 'bg-indigo-600 text-white ring-indigo-600' : 'ring-slate-300 hover:bg-slate-50'}`}>{a}°</button>
              ))}
            </div>
          </div>
          <div>
            <span className={fieldLabel}>Layout</span>
            <Segmented label="Layout" value={s.layout} onChange={(layout) => set({ layout })} options={[{ value: 'center', label: 'Centered' }, { value: 'tile', label: 'Tiled' }]} />
          </div>
          <div>
            <label htmlFor={ids.pages} className={fieldLabel}>Pages</label>
            <input id={ids.pages} value={pagesText} onChange={(e) => setPagesText(e.target.value)} placeholder="All pages (e.g. 1-3, 5)" aria-invalid={'error' in parsed} className={`${inputClass} ${'error' in parsed ? 'border-red-400' : ''}`} />
            {'error' in parsed && <p className="mt-1 text-xs font-medium text-red-600">{parsed.error}</p>}
          </div>

          <ToolAction
            label="Add watermark"
            icon={<Droplets className="size-5" aria-hidden />}
            status={tool.status}
            disabledReason={disabledReason}
            stale={tool.status.state === 'done' && tool.status.signature !== signature}
            onRun={run}
            onCancel={tool.cancel}
            onDismiss={tool.dismiss}
            onAddToFiles={onAddToFiles}
          />
        </Panel>
      </aside>
    </div>
  )
}
