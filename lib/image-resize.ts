/**
 * Browser-side photo preparation for the club gallery. Phone photos are routinely 4-10 MB
 * and 4000 px wide; a gallery thumbnail strip should not download those. Before upload a
 * large image is redrawn at most 1600 px on its longest side and re-encoded as WebP
 * (EXIF rotation is applied by the decoder), which typically lands under 400 KB and
 * keeps every photo under the bucket's 5 MB cap. Small images are left untouched.
 * Browser only (canvas); on any failure the original file is returned unchanged.
 */

export const GALLERY_MAX_EDGE = 1600
/** Images already this small are uploaded as they are. */
const KEEP_AS_IS_BYTES = 1.2 * 1024 * 1024
/** Refuse to even decode something absurd in the browser. */
export const GALLERY_MAX_RAW_BYTES = 30 * 1024 * 1024

export async function prepareGalleryImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file) // honours EXIF orientation
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= GALLERY_MAX_EDGE && file.size <= KEEP_AS_IS_BYTES) {
      bitmap.close()
      return file
    }

    const scale = Math.min(1, GALLERY_MAX_EDGE / longest)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    // Keep the original when the re-encode failed or did not help.
    if (!blob || blob.type !== 'image/webp' || (scale === 1 && blob.size >= file.size)) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: Date.now() })
  } catch {
    return file
  }
}
