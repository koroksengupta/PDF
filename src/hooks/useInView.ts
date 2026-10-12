import { useEffect, useState, type RefObject } from 'react'

/** True once the element has come within `rootMargin` of the viewport (and while it stays there). */
export function useInView(ref: RefObject<Element | null>, rootMargin = '300px') {
  const supported = typeof IntersectionObserver !== 'undefined'
  // Without IntersectionObserver, treat everything as visible.
  const [inView, setInView] = useState(!supported)
  useEffect(() => {
    const el = ref.current
    if (!el || !supported) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, rootMargin, supported])
  return inView
}
