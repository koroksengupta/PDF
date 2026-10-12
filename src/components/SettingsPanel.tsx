import { Settings2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { sanitizeFileName } from '../lib/format'
import { FONT_SIZES, FORMATS, POSITIONS, type StitchSettings } from '../lib/settings'
import type { PageNumberFormat, PageNumberOptions } from '../lib/types'
import { Toggle } from './Toggle'

function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'

interface Props {
  settings: StitchSettings
  onChange: (s: StitchSettings) => void
  summary: ReactNode
  action: ReactNode
}

export function SettingsPanel({ settings, onChange, summary, action }: Props) {
  const ids = { name: useId(), format: useId(), start: useId(), size: useId() }
  // Edit the raw text freely; normalise into a safe filename on blur.
  const [draftName, setDraftName] = useState(settings.fileName.replace(/\.pdf$/i, ''))
  const pn = settings.pageNumbers
  const setPn = (patch: Partial<PageNumberOptions>) =>
    onChange({ ...settings, pageNumbers: { ...pn, ...patch } })

  const commitName = () => {
    const fileName = sanitizeFileName(draftName)
    setDraftName(fileName.replace(/\.pdf$/i, ''))
    if (fileName !== settings.fileName) onChange({ ...settings, fileName })
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Settings2 className="size-4" aria-hidden /> Output settings
      </h2>

      <div className="mt-4 space-y-5">
        <Field label="File name" htmlFor={ids.name}>
          <div className="flex rounded-lg shadow-sm">
            <input
              id={ids.name}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder="stitched_document"
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} rounded-r-none shadow-none`}
            />
            <span className="inline-flex items-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
              .pdf
            </span>
          </div>
        </Field>

        <Toggle
          checked={settings.separatorPages}
          onChange={(separatorPages) => onChange({ ...settings, separatorPages })}
          label="Blank separator pages"
          description="Insert an empty page between each card."
        />

        <div className="space-y-4">
          <Toggle
            checked={pn.enabled}
            onChange={(enabled) => setPn({ enabled })}
            label="Page numbers"
            description="Stamp a number in the footer of every page."
          />
          {pn.enabled && (
            <div className="grid animate-fade-in grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="col-span-2">
                <Field label="Format" htmlFor={ids.format}>
                  <select
                    id={ids.format}
                    value={pn.format}
                    onChange={(e) => setPn({ format: e.target.value as PageNumberFormat })}
                    className={inputClass}
                  >
                    {FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600" id={`${ids.format}-pos`}>
                  Position
                </span>
                <div role="radiogroup" aria-labelledby={`${ids.format}-pos`} className="grid grid-cols-3 rounded-lg bg-white p-0.5 ring-1 ring-slate-300">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={pn.position === p}
                      onClick={() => setPn({ position: p })}
                      className={`rounded-md py-1.5 text-sm capitalize transition ${
                        pn.position === p ? 'bg-indigo-600 font-medium text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Start at" htmlFor={ids.start}>
                <input
                  id={ids.start}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99999}
                  value={pn.startAt}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value))
                    if (Number.isFinite(n)) setPn({ startAt: Math.min(Math.max(n, 0), 99999) })
                  }}
                  className={inputClass}
                />
              </Field>
              <Field label="Font size" htmlFor={ids.size}>
                <select
                  id={ids.size}
                  value={pn.fontSize}
                  onChange={(e) => setPn({ fontSize: Number(e.target.value) })}
                  className={inputClass}
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} pt
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">{summary}</div>
        {action}
      </div>
    </div>
  )
}
