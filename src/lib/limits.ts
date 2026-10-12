/** Single files above this are rejected; browsers struggle to parse and clone much more. */
export const MAX_FILE_BYTES = 250 * 1024 * 1024
/** Combined size of everything on the canvas. Stitching briefly needs ~3× this in memory. */
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024
/** Thumbnail edge length in CSS pixels. */
export const THUMB_CSS_SIZE = 132
export const PREVIEW_CSS_SIZE = 1100
