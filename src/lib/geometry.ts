/**
 * "Visual" space is the page as a viewer shows it: origin top-left, y down, after the
 * page's /Rotate is applied. Editors and layout work in visual fractions (0..1), and
 * these helpers map them onto PDF user space so output looks right on rotated pages.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type QuarterTurn = 0 | 90 | 180 | 270

export const toQuarterTurn = (angle: number): QuarterTurn =>
  ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as QuarterTurn

/** Size of the page as displayed, in points. */
export function visualSize(box: Box, rotation: QuarterTurn) {
  return rotation % 180 === 0
    ? { width: box.width, height: box.height }
    : { width: box.height, height: box.width }
}

/** Maps a visual fraction (u right, v down) to a user-space point. Viewers rotate clockwise. */
export function visualToUser(box: Box, rotation: QuarterTurn, u: number, v: number) {
  const { x, y, width: w, height: h } = box
  switch (rotation) {
    case 90:
      return { x: x + v * w, y: y + u * h }
    case 180:
      return { x: x + (1 - u) * w, y: y + v * h }
    case 270:
      return { x: x + (1 - v) * w, y: y + (1 - u) * h }
    default:
      return { x: x + u * w, y: y + (1 - v) * h }
  }
}

/**
 * pdf-lib draws text and images from an anchor (their bottom-left), rotated
 * counter-clockwise around it. To centre a w×h item on `center` at `angle` degrees
 * (counter-clockwise, in user space), start from this anchor.
 */
export function anchorForCentered(center: { x: number; y: number }, w: number, h: number, angle: number) {
  const a = (angle * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return {
    x: center.x - (cos * w) / 2 + (sin * h) / 2,
    y: center.y - (sin * w) / 2 - (cos * h) / 2,
  }
}

/** Parses "1-3, 5, 8-" style page lists (1-based) into sorted unique page numbers. */
export function parsePageList(text: string, pageCount: number): { pages: number[] } | { error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { pages: Array.from({ length: pageCount }, (_, i) => i + 1) }
  const pages = new Set<number>()
  for (const part of trimmed.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part) ?? /^(\d+)$/.exec(part)
    if (!m) return { error: `“${part}” isn't a page or range` }
    const isRange = part.includes('-')
    const start = m[1] ? Number(m[1]) : 1
    const end = isRange ? (m[2] ? Number(m[2]) : pageCount) : start
    if (start < 1 || end > pageCount || start > end) {
      return { error: `“${part}” is outside pages 1–${pageCount}` }
    }
    for (let p = start; p <= end; p++) pages.add(p)
  }
  return { pages: [...pages].sort((a, b) => a - b) }
}

/** Parses #rrggbb into 0..1 channels (falls back to black). */
export function hexToRgb01(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
