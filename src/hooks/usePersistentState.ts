import { useEffect, useState } from 'react'

/** useState mirrored to localStorage. Storage failures (private mode, quota) are ignored. */
export function usePersistentState<T>(key: string, initial: T, validate: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw)
        if (validate(parsed)) return parsed
      }
    } catch {
      /* ignore */
    }
    return initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value])
  return [value, setValue] as const
}
