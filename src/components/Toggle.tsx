import { useId, type ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: ReactNode
}

export function Toggle({ checked, onChange, label, description }: Props) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
