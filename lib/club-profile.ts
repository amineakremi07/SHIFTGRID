import { z } from 'zod'
import { stripHtml } from '@/lib/sanitize-text'
import { normalizeWhatsapp } from '@/lib/whatsapp'

/**
 * The club's public profile ("vitrine"): name, bio, address, map pin and photo gallery.
 * Pure (no server imports): the settings form and the Server Actions share these rules,
 * and the public page uses the URL helpers to render only this club's own photos.
 */

export const GALLERY_BUCKET = 'club-assets'
export const GALLERY_MAX = 12
export const GALLERY_MAX_BYTES = 5 * 1024 * 1024
export const BIO_MAX = 1000

/** Allowed uploads and the extension each is stored with (the bucket enforces the same list). */
export const GALLERY_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export type GalleryMime = keyof typeof GALLERY_TYPES

/** A generous box around Tunisia: a pin on another continent is a typo, not a club. */
export const TUNISIA_BOUNDS = { latMin: 29, latMax: 38.5, lngMin: 7, lngMax: 12.5 } as const
/** Where the map opens when the club has not placed a pin yet (Tunis). */
export const DEFAULT_MAP_CENTER = { latitude: 36.8065, longitude: 10.1815 } as const

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

export const clubProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the club name (2 characters minimum)').max(100, 'The name is too long (100 characters maximum)').transform(stripHtml),
    description: z.preprocess(blankToNull, z.string().trim().max(BIO_MAX, `The bio is limited to ${BIO_MAX} characters`).transform(stripHtml).nullable()),
    address: z.preprocess(blankToNull, z.string().trim().max(200, 'The address is too long (200 characters maximum)').transform(stripHtml).nullable()),
    city: z.preprocess(blankToNull, z.string().trim().max(80, 'The city name is too long').transform(stripHtml).nullable()),
    /** Stored as digits in international form (216XXXXXXXX); typed with spaces, +216 or 8 local digits. */
    whatsappNumber: z
      .preprocess((v) => (v === undefined ? null : blankToNull(v)), z.string().trim().max(30, 'That number is too long').nullable())
      .transform((value, ctx) => {
        if (value === null) return null
        const normalized = normalizeWhatsapp(value)
        if (!normalized) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid number, e.g. +216 98 123 456' })
          return z.NEVER
        }
        return normalized
      }),
    latitude: z.number().finite().nullable(),
    longitude: z.number().finite().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.latitude === null) !== (v.longitude === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latitude'], message: 'Place the pin on the map (latitude and longitude go together)' })
      return
    }
    if (v.latitude === null || v.longitude === null) return
    const { latMin, latMax, lngMin, lngMax } = TUNISIA_BOUNDS
    if (v.latitude < latMin || v.latitude > latMax || v.longitude < lngMin || v.longitude > lngMax) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latitude'], message: 'That location is outside Tunisia. Move the pin to your club.' })
    }
  })

export type ClubProfileInput = z.input<typeof clubProfileSchema>
export type ClubProfile = z.output<typeof clubProfileSchema>

/** Client-side check of one chosen file, with the same limits as the bucket. */
export function validateGalleryFile(file: { type: string; size: number; name?: string }): string | null {
  if (!(file.type in GALLERY_TYPES)) return `${file.name ?? 'This file'} is not a JPG, PNG or WebP image.`
  if (file.size > GALLERY_MAX_BYTES) return `${file.name ?? 'This file'} is larger than 5 MB.`
  if (file.size === 0) return `${file.name ?? 'This file'} is empty.`
  return null
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')

/** Everything a photo of this club's public URL starts with. */
export function galleryPublicPrefix(supabaseUrl: string, orgId: string): string {
  return `${trimSlash(supabaseUrl)}/storage/v1/object/public/${GALLERY_BUCKET}/${orgId}/`
}

/** Storage path of one of the club's own gallery URLs, or null for anything else. */
export function galleryPathFromUrl(url: string, orgId: string, supabaseUrl: string): string | null {
  const prefix = galleryPublicPrefix(supabaseUrl, orgId)
  if (!url.startsWith(prefix)) return null
  const name = url.slice(prefix.length)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(name) ? `${orgId}/${name}` : null
}

/** Only render photos that really live in this club's folder of our bucket. */
export function ownGalleryUrls(urls: readonly string[] | null | undefined, orgId: string, supabaseUrl: string): string[] {
  return (urls ?? []).filter((u) => galleryPathFromUrl(u, orgId, supabaseUrl) !== null)
}

/** True for a path a Server Action minted for this club (`<orgId>/<uuid>.<ext>`). */
export function isOwnGalleryPath(path: string, orgId: string): boolean {
  return new RegExp(`^${orgId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$`).test(path)
}

/** "Open in maps" links for a pin. */
export const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
