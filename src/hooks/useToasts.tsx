import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'error' | 'success' | 'info' | 'warning'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  description?: string
}

interface ToastApi {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)
const DURATION: Record<ToastKind, number> = { error: 9000, warning: 7000, info: 4500, success: 4500 }
const MAX_TOASTS = 5

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((list) => [...list, { ...toast, id }].slice(-MAX_TOASTS))
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION[toast.kind]))
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used inside <ToastProvider>')
  return ctx
}
