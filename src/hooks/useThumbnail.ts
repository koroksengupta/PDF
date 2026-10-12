import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { ThumbnailService, thumbnails, type ThumbState } from '../lib/thumbnails'

/** Pixel size to render at for a given CSS size, accounting for HiDPI screens (capped at 2×). */
export function renderSize(cssSize: number) {
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  return Math.round(cssSize * dpr)
}

/**
 * Subscribes to a page preview. Rendering is only requested while `enabled`
 * (i.e. the thumbnail is on screen) and dropped from the queue when it scrolls away.
 */
export function useThumbnail(
  sourceId: string,
  index: number,
  cssSize: number,
  enabled: boolean,
): ThumbState | undefined {
  const size = renderSize(cssSize)
  const key = ThumbnailService.key(sourceId, index, size)
  const subscribe = useCallback((cb: () => void) => thumbnails.subscribe(key, cb), [key])
  const state = useSyncExternalStore(subscribe, () => thumbnails.get(sourceId, index, size))

  useEffect(() => {
    if (!enabled || state) return
    thumbnails.request(sourceId, index, size)
    return () => thumbnails.cancel(sourceId, index, size)
  }, [enabled, state, sourceId, index, size])

  return state
}
