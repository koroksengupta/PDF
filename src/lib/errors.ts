import type { InspectErrorCode } from './types'

/** Kept free of pdf-lib imports so the main bundle can use it without pulling in the engine. */
export class PdfInspectError extends Error {
  readonly code: InspectErrorCode
  constructor(code: InspectErrorCode, message: string) {
    super(message)
    this.name = 'PdfInspectError'
    this.code = code
  }
}
