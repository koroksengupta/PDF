import { AlertTriangle, ClipboardList, Loader2, Lock } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTransform } from '../../hooks/useTransform'
import type { FormFieldInfo, FormInfo } from '../../lib/editTypes'
import { plural } from '../../lib/format'
import { sourceStore } from '../../lib/sourceStore'
import type { SourceMeta } from '../../lib/types'
import { Panel, ToolAction, ToolFrame, type ToolFrameProps } from './ToolFrame'
import { inputClass, outputName } from './toolStyles'

type Value = string | boolean | string[]

export function FormTool(props: ToolFrameProps) {
  return (
    <ToolFrame {...props} emptyTitle="Drop a PDF form to fill it in">
      {(file) => <FormBody file={file} onAddToFiles={props.onAddToFiles} />}
    </ToolFrame>
  )
}

/** Turns "applicant.address[0].city" into "Applicant › Address › City". */
const prettyName = (name: string) =>
  name
    .split('.')
    .map((part) => part.replace(/\[\d+\]$/, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' › ')

function FormBody({ file, onAddToFiles }: { file: SourceMeta; onAddToFiles: (f: File) => void }) {
  const tool = useTransform('Form saved')
  const [info, setInfo] = useState<FormInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, Value>>({})
  const [flatten, setFlatten] = useState(false)

  const { client } = tool
  useEffect(() => {
    let cancelled = false
    const bytes = sourceStore.get(file.id)
    if (!bytes) return
    client
      .readForm(bytes)
      .then((result) => {
        if (cancelled) return
        setInfo(result)
        setValues(Object.fromEntries(result.fields.map((f) => [f.name, f.value])))
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [client, file.id])

  const editable = useMemo(() => info?.fields.filter((f) => f.type !== 'other') ?? [], [info])
  const byPage = useMemo(() => {
    const groups = new Map<number | null, FormFieldInfo[]>()
    for (const f of editable) groups.set(f.page, [...(groups.get(f.page) ?? []), f])
    return [...groups.entries()].sort(([a], [b]) => (a ?? 1e9) - (b ?? 1e9))
  }, [editable])
  const missing = editable.filter((f) => f.required && !f.readOnly && (values[f.name] === '' || values[f.name] === false || (Array.isArray(values[f.name]) && !(values[f.name] as string[]).length)))

  const signature = JSON.stringify([values, flatten])
  const run = () => {
    // Send only what changed; untouched fields keep their exact original appearance.
    const changed = Object.fromEntries(
      editable.filter((f) => JSON.stringify(values[f.name]) !== JSON.stringify(f.value)).map((f) => [f.name, values[f.name]]),
    )
    void tool.run(file.id, { kind: 'fillForm', params: { values: changed, flatten } }, outputName(file, flatten ? 'filled_locked' : 'filled'), signature)
  }

  if (error) {
    return <p className="rounded-2xl bg-white p-5 text-sm text-red-700 shadow-sm ring-1 ring-red-200">{error}</p>
  }
  if (!info) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
        <Loader2 className="size-4 animate-spin text-indigo-600" aria-hidden /> Looking for form fields…
      </p>
    )
  }
  if (editable.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">This PDF has no fillable fields.</p>
        <p className="mt-1">
          To type onto a flat (scanned or printed) form, use <strong>Edit &amp; sign</strong> and add text boxes where you need them.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section aria-label="Form fields" className="space-y-4">
        {info.hasXfa && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            This form also contains dynamic (XFA) content. It will be saved as a standard form, which most viewers prefer.
          </p>
        )}
        {byPage.map(([page, fields]) => (
          <div key={page ?? 'none'} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{page ? `Page ${page}` : 'Other fields'}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((all) => ({ ...all, [f.name]: v }))} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <aside className="lg:sticky lg:top-20">
        <Panel title="Fill form" icon={<ClipboardList />}>
          <p className="text-sm text-slate-600">{plural(editable.length, 'field')} found.</p>
          {missing.length > 0 && (
            <p className="text-xs text-amber-700">{plural(missing.length, 'required field')} still empty. You can save anyway.</p>
          )}
          <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
            <span>
              <span className="flex items-center gap-1.5 font-medium text-slate-800"><Lock className="size-3.5" aria-hidden /> Lock the answers</span>
              <span className="mt-0.5 block text-xs text-slate-500">Turns fields into regular page content so they can't be changed.</span>
            </span>
          </label>
          <ToolAction
            label="Save filled PDF"
            icon={<ClipboardList className="size-5" aria-hidden />}
            status={tool.status}
            disabledReason={null}
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

function Field({ field, value, onChange }: { field: FormFieldInfo; value: Value; onChange: (v: Value) => void }) {
  const id = useId()
  const label = (
    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
      {prettyName(field.name) || field.name}
      {field.required && <span className="text-red-600" aria-label="required">*</span>}
      {field.readOnly && <Lock className="size-3 text-slate-400" aria-label="read-only" />}
    </span>
  )
  const disabled = field.readOnly

  switch (field.type) {
    case 'checkbox':
      return (
        <label className="flex items-center gap-2.5 self-end rounded-lg px-1 py-2 text-sm text-slate-800">
          <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-indigo-600" />
          {prettyName(field.name) || field.name}
          {field.required && <span className="text-red-600">*</span>}
        </label>
      )
    case 'radio':
      return (
        <fieldset className={field.options.length > 3 ? 'sm:col-span-2' : ''}>
          <legend>{label}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {field.options.map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-sm text-slate-800">
                <input type="radio" name={`${id}-radio`} checked={value === o} disabled={disabled} onChange={() => onChange(o)} className="size-4 accent-indigo-600" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      )
    case 'dropdown':
      return (
        <label htmlFor={id}>
          {label}
          <select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'optionlist':
      return (
        <label htmlFor={id}>
          {label}
          <select
            id={id}
            multiple={field.multiSelect}
            value={field.multiSelect ? (value as string[]) : ((value as string[])[0] ?? '')}
            disabled={disabled}
            onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
            className={inputClass}
          >
            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    default:
      return (
        <label htmlFor={id} className={field.multiline ? 'sm:col-span-2' : ''}>
          {label}
          {field.multiline ? (
            <textarea id={id} value={String(value)} disabled={disabled} maxLength={field.maxLength} rows={3} onChange={(e) => onChange(e.target.value)} className={inputClass} />
          ) : (
            <input id={id} value={String(value)} disabled={disabled} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} className={inputClass} />
          )}
        </label>
      )
  }
}
