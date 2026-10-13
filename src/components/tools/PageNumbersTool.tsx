import { Hash } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { usePageSizes } from '../../hooks/usePageSizes'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useTransform } from '../../hooks/useTransform'
import { PAGE_NUMBER_PRESETS, fillTemplate, type HAlign, type VAlign } from '../../lib/editTypes'
import { parsePageList } from '../../lib/geometry'
import type { SourceMeta } from '../../lib/types'
import { ColorSwatches, Panel, Segmented, ToolAction, ToolFrame, type ToolFrameProps } from './ToolFrame'
import { fieldLabel, inputClass, outputName } from './toolStyles'
import { PagePreviewBox } from './PagePreviewBox'
import { cqw } from './toolStyles'

interface Settings {
  template: string
  vertical: VAlign
  align: HAlign
  fontSize: number
  color: string
}
const DEFAULTS: Settings = { template: 'Page {n} of {total}', vertical: 'bottom', align: 'center', fontSize: 10, color: '#3f3f4a' }
const isSettings = (v: unknown): v is Settings =>
  !!v && typeof v === 'object' && typeof (v as Settings).template === 'string' && typeof (v as Settings).fontSize === 'number'

export function PageNumbersTool(props: ToolFrameProps) {
  return (
    <ToolFrame {...props} emptyTitle="Drop a PDF to add page numbers">
      {(file) => <PageNumbersBody file={file} onAddToFiles={props.onAddToFiles} />}
    </ToolFrame>
  )
}

function PageNumbersBody({ file, onAddToFiles }: { file: SourceMeta; onAddToFiles: (f: File) => void }) {
  const ids = { tpl: useId(), start: useId(), size: useId(), pages: useId() }
  const [settings, setSettings] = usePersistentState('pdf-stitch:page-numbers:v1', DEFAULTS, isSettings)
  const [startAt, setStartAt] = useState(1)
  const [pagesText, setPagesText] = useState('')
  const sizes = usePageSizes(file.id, file.pageCount)
  const tool = useTransform('Page numbers added')
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })

  const parsed = useMemo(() => parsePageList(pagesText, file.pageCount), [pagesText, file.pageCount])
  const pages = 'pages' in parsed ? parsed.pages : []
  const total = startAt + pages.length - 1
  const preset = PAGE_NUMBER_PRESETS.find((p) => p.template === settings.template)
  const signature = JSON.stringify([settings, startAt, pagesText])
  const disabledReason =
    'error' in parsed ? 'Fix the page list to continue.' : !settings.template.trim() ? 'Enter a label format.' : null

  const run = () =>
    tool.run(
      file.id,
      { kind: 'pageNumbers', params: { ...settings, startAt, pages: pagesText.trim() ? pages : [] } },
      outputName(file, 'numbered'),
      signature,
    )

  // Preview the first three pages that will be numbered.
  const previewPages = pages.slice(0, 3)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section aria-label="Preview" className="rounded-2xl bg-slate-200/60 p-4 sm:p-6">
        <p className="mb-3 text-xs font-medium text-slate-500">Preview</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {previewPages.map((p, i) => {
            const size = sizes[p - 1]
            const width = size?.width ?? 612
            const height = size?.height ?? 792
            const margin = Math.max(18, settings.fontSize * 2)
            const side = Math.max(36, settings.fontSize * 3)
            return (
              <div key={p}>
                <PagePreviewBox sourceId={file.id} index={p - 1} size={size}>
                  <span
                    className="absolute whitespace-nowrap font-[Helvetica,Arial,sans-serif] leading-none"
                    style={{
                      fontSize: cqw(settings.fontSize, width),
                      color: settings.color,
                      [settings.vertical]: `${(margin - (settings.vertical === 'bottom' ? settings.fontSize * 0.2 : 0)) / height * 100}%`,
                      ...(settings.align === 'center'
                        ? { left: '50%', transform: 'translateX(-50%)' }
                        : { [settings.align]: `${(side / width) * 100}%` }),
                    }}
                  >
                    {fillTemplate(settings.template, startAt + i, total)}
                  </span>
                </PagePreviewBox>
                <p className="mt-1.5 text-center text-xs text-slate-500">Page {p}</p>
              </div>
            )
          })}
        </div>
      </section>

      <aside className="lg:sticky lg:top-20">
        <Panel title="Page numbers" icon={<Hash />}>
          <div>
            <label htmlFor={ids.tpl} className={fieldLabel}>Format</label>
            <select
              value={preset ? preset.template : 'custom'}
              onChange={(e) => e.target.value !== 'custom' && set({ template: e.target.value })}
              className={`${inputClass} mb-2`}
              aria-label="Format preset"
            >
              {PAGE_NUMBER_PRESETS.map((p) => (
                <option key={p.template} value={p.template}>{p.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <input id={ids.tpl} value={settings.template} onChange={(e) => set({ template: e.target.value })} className={inputClass} spellCheck={false} />
            <p className="mt-1 text-xs text-slate-500">Use {'{n}'} for the number and {'{total}'} for the last number.</p>
          </div>

          <div>
            <span className={fieldLabel}>Position</span>
            <div className="space-y-2">
              <Segmented label="Top or bottom" value={settings.vertical} onChange={(vertical) => set({ vertical })} options={[{ value: 'top', label: 'Header' }, { value: 'bottom', label: 'Footer' }]} />
              <Segmented label="Alignment" value={settings.align} onChange={(align) => set({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.start} className={fieldLabel}>First number</label>
              <input id={ids.start} type="number" min={0} value={startAt} onChange={(e) => setStartAt(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} className={inputClass} />
            </div>
            <div>
              <label htmlFor={ids.size} className={fieldLabel}>Font size</label>
              <select id={ids.size} value={settings.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} className={inputClass}>
                {[8, 9, 10, 11, 12, 14, 16, 18, 24].map((s) => <option key={s} value={s}>{s} pt</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={ids.pages} className={fieldLabel}>Pages to number</label>
            <input
              id={ids.pages}
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder={`All pages (e.g. 2-${file.pageCount} to skip a cover)`}
              aria-invalid={'error' in parsed}
              className={`${inputClass} ${'error' in parsed ? 'border-red-400' : ''}`}
            />
            {'error' in parsed && <p className="mt-1 text-xs font-medium text-red-600">{parsed.error}</p>}
          </div>

          <div>
            <span className={fieldLabel}>Colour</span>
            <ColorSwatches value={settings.color} onChange={(color) => set({ color })} colors={['#3f3f4a', '#111827', '#6b7280', '#2563eb', '#dc2626']} />
          </div>

          <ToolAction
            label="Add page numbers"
            icon={<Hash className="size-5" aria-hidden />}
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
