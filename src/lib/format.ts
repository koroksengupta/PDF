export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export const DEFAULT_OUTPUT_NAME = 'stitched_document.pdf'

/** Produces a filename that is safe on Windows, macOS and Linux and always ends in .pdf. */
export function sanitizeFileName(input: string): string {
  let name = input
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `_${name}`
  if (!name) return DEFAULT_OUTPUT_NAME
  return `${name.slice(0, 200)}.pdf`
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) =>
  `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`
