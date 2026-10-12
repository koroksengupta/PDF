import { MoreVertical } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

/** Small accessible overflow menu (click to open, Escape / outside click to close). */
export function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <MoreVertical className="size-5" aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="absolute right-0 top-10 z-30 w-52 animate-fade-in rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="text-slate-400 [&>svg]:size-4">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
