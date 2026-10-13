import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToasts, type ToastKind } from '../hooks/useToasts'

const STYLES: Record<ToastKind, { icon: typeof Info; ring: string; iconColor: string }> = {
  error: { icon: AlertCircle, ring: 'ring-red-200', iconColor: 'text-red-600' },
  warning: { icon: AlertTriangle, ring: 'ring-amber-200', iconColor: 'text-amber-600' },
  success: { icon: CheckCircle2, ring: 'ring-emerald-200', iconColor: 'text-emerald-600' },
  info: { icon: Info, ring: 'ring-slate-200', iconColor: 'text-indigo-600' },
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((t) => {
        const { icon: Icon, ring, iconColor } = STYLES[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl bg-white p-3.5 shadow-lg ring-1 ${ring}`}
          >
            <Icon className={`mt-0.5 size-5 shrink-0 ${iconColor}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 break-words text-sm text-slate-600">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
