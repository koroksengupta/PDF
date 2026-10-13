import type { ImageAsset } from './editTypes'

export interface LoadedImage {
  asset: ImageAsset
  /** Object URL for on-screen previews; revoke when done. */
  url: string
  width: number
  height: number
}

/**
 * Reads any browser-decodable image into PNG/JPEG bytes pdf-lib can embed. Images are
 * re-encoded through a canvas, which also normalises EXIF orientation and odd formats.
 */
export async function loadImageFile(file: File, maxSide = 2400): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” is not an image.`)
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`“${file.name}” could not be read as an image.`)
  })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // JPEG keeps photos small; PNG keeps transparency (logos, signatures).
  const type = file.type === 'image/jpeg' ? 'jpg' : 'png'
  return canvasToImage(canvas, type)
}

export async function canvasToImage(canvas: HTMLCanvasElement, type: 'png' | 'jpg' = 'png'): Promise<LoadedImage> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type === 'jpg' ? 'image/jpeg' : 'image/png', 0.9),
  )
  if (!blob) throw new Error('Could not encode the image.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { asset: { bytes, type }, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height }
}
