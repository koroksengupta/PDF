import { useEffect, useState } from 'react'
import { thumbnails } from '../lib/thumbnails'

/** Displayed size (points) of every page of a file; entries fill in as pdf.js reports them. */
export function usePageSizes(sourceId: string, pageCount: number) {
  const [sizes, setSizes] = useState<({ width: number; height: number } | undefined)[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result: { width: number; height: number }[] = []
      for (let i = 0; i < pageCount; i++) {
        try {
          result.push(await thumbnails.pageSize(sourceId, i))
        } catch {
          result.push({ width: 612, height: 792 })
        }
        // Publish progressively so the first pages are usable right away.
        if (!cancelled && (i < 3 || i === pageCount - 1 || i % 20 === 0)) setSizes([...result])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sourceId, pageCount])
  return sizes
}
