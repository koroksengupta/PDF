import { DEFAULT_OUTPUT_NAME } from './format'
import type { PageNumberFormat, PageNumberOptions, PageNumberPosition } from './types'

export interface StitchSettings {
  fileName: string
  separatorPages: boolean
  pageNumbers: PageNumberOptions
}

export const DEFAULT_SETTINGS: StitchSettings = {
  fileName: DEFAULT_OUTPUT_NAME,
  separatorPages: false,
  pageNumbers: { enabled: false, format: 'page-n-of-total', position: 'center', fontSize: 10, startAt: 1 },
}

export const FORMATS: { value: PageNumberFormat; label: string }[] = [
  { value: 'n', label: '1' },
  { value: 'page-n', label: 'Page 1' },
  { value: 'n-of-total', label: '1 / 12' },
  { value: 'page-n-of-total', label: 'Page 1 of 12' },
]
export const POSITIONS: PageNumberPosition[] = ['left', 'center', 'right']
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16]

export function isStitchSettings(v: unknown): v is StitchSettings {
  if (!v || typeof v !== 'object') return false
  const s = v as StitchSettings
  const pn = s.pageNumbers
  return (
    typeof s.fileName === 'string' &&
    typeof s.separatorPages === 'boolean' &&
    !!pn &&
    typeof pn.enabled === 'boolean' &&
    FORMATS.some((f) => f.value === pn.format) &&
    POSITIONS.includes(pn.position) &&
    FONT_SIZES.includes(pn.fontSize) &&
    Number.isInteger(pn.startAt)
  )
}
