import { describe, expect, it } from 'vitest'
import { DEFAULT_OUTPUT_NAME, formatBytes, sanitizeFileName } from './format'

describe('sanitizeFileName', () => {
  it.each([
    ['', DEFAULT_OUTPUT_NAME],
    ['   ', DEFAULT_OUTPUT_NAME],
    ['.pdf', DEFAULT_OUTPUT_NAME],
    ['report', 'report.pdf'],
    ['report.PDF', 'report.pdf'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j.pdf'],
    ['  spaced   out  .pdf ', 'spaced out.pdf'],
    ['..hidden', 'hidden.pdf'],
    ['CON', '_CON.pdf'],
    ['résumé', 'résumé.pdf'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected)
  })

  it('caps very long names', () => {
    expect(sanitizeFileName('x'.repeat(500))).toHaveLength(204)
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})
