import { expect, test } from '@playwright/test'

import {
  clubProfileSchema,
  galleryPathFromUrl,
  galleryPublicPrefix,
  GALLERY_MAX_BYTES,
  isOwnGalleryPath,
  ownGalleryUrls,
  validateGalleryFile,
} from '../lib/club-profile'

/** Pure checks for the club profile rules (no browser, no database). */

const SUPA = 'https://abc.supabase.co'
const ORG = '3f2b1c0e-8a1d-4e55-9c1a-2f6d8b7a1e10'
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const FILE = '0b5e8c2a-1d3f-4a6b-8c9d-1e2f3a4b5c6d'
const url = (org = ORG, name = `${FILE}.jpg`) => `${galleryPublicPrefix(SUPA, org)}${name}`
const ok = { name: 'Padel Club', description: null, address: null, city: null, latitude: null, longitude: null }

test.describe('club profile schema', () => {
  test('accepts a complete profile and a bare one', () => {
    expect(clubProfileSchema.safeParse({ ...ok, description: 'Great courts', address: '12 Ave Habib Bourguiba', city: 'Tunis', latitude: 36.8, longitude: 10.18 }).success).toBe(true)
    expect(clubProfileSchema.safeParse(ok).success).toBe(true)
  })

  test('blank optional boxes become null and text is trimmed', () => {
    const r = clubProfileSchema.safeParse({ ...ok, name: '  Padel Club  ', description: '   ', address: '', city: ' Sfax ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Padel Club')
      expect(r.data.description).toBeNull()
      expect(r.data.address).toBeNull()
      expect(r.data.city).toBe('Sfax')
    }
  })

  test('limits: name 2-100, bio 1000, address 200', () => {
    expect(clubProfileSchema.safeParse({ ...ok, name: 'A' }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, name: 'A'.repeat(101) }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, description: 'x'.repeat(1000) }).success).toBe(true)
    expect(clubProfileSchema.safeParse({ ...ok, description: 'x'.repeat(1001) }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, address: 'x'.repeat(201) }).success).toBe(false)
  })

  test('latitude and longitude go together and stay in Tunisia', () => {
    expect(clubProfileSchema.safeParse({ ...ok, latitude: 36.8, longitude: null }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, latitude: null, longitude: 10.1 }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, latitude: 48.85, longitude: 2.35 }).success).toBe(false) // Paris
    expect(clubProfileSchema.safeParse({ ...ok, latitude: 0, longitude: 0 }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, latitude: Number.NaN, longitude: 10 }).success).toBe(false)
    expect(clubProfileSchema.safeParse({ ...ok, latitude: 33.88, longitude: 10.1 }).success).toBe(true) // Gabès
  })

  test('is strict: status, rating or gallery cannot be smuggled in', () => {
    for (const extra of [{ status: 'approved' }, { gallery_urls: ['https://evil.test/x.png'] }, { id: ORG }, { registry_number: '1' }]) {
      expect(clubProfileSchema.safeParse({ ...ok, ...extra }).success).toBe(false)
    }
  })
})

test.describe('gallery files and urls', () => {
  test('only JPG, PNG and WebP up to 5 MB', () => {
    expect(validateGalleryFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(validateGalleryFile({ type: 'image/png', size: GALLERY_MAX_BYTES })).toBeNull()
    expect(validateGalleryFile({ type: 'image/webp', size: 10 })).toBeNull()
    expect(validateGalleryFile({ type: 'image/svg+xml', size: 10 })).not.toBeNull()
    expect(validateGalleryFile({ type: 'image/gif', size: 10 })).not.toBeNull()
    expect(validateGalleryFile({ type: 'text/html', size: 10 })).not.toBeNull()
    expect(validateGalleryFile({ type: 'image/png', size: GALLERY_MAX_BYTES + 1 })).not.toBeNull()
    expect(validateGalleryFile({ type: 'image/png', size: 0 })).not.toBeNull()
  })

  test('a photo URL maps back to its own storage path, and nothing else does', () => {
    expect(galleryPathFromUrl(url(), ORG, SUPA)).toBe(`${ORG}/${FILE}.jpg`)
    expect(galleryPathFromUrl(url(OTHER), ORG, SUPA)).toBeNull() // another club's folder
    expect(galleryPathFromUrl(url(ORG, 'x.jpg'), ORG, SUPA)).toBeNull() // not a minted name
    expect(galleryPathFromUrl(url(ORG, `${FILE}.svg`), ORG, SUPA)).toBeNull()
    expect(galleryPathFromUrl(`https://evil.test/${ORG}/${FILE}.jpg`, ORG, SUPA)).toBeNull()
    expect(galleryPathFromUrl(`${url()}/../../x`, ORG, SUPA)).toBeNull()
    expect(galleryPathFromUrl(url(), ORG, `${SUPA}/`)).toBe(`${ORG}/${FILE}.jpg`) // trailing slash tolerated
  })

  test('the public page renders only this club\'s own photos', () => {
    const mine = url()
    expect(ownGalleryUrls([mine, url(OTHER), 'https://evil.test/a.png', 'javascript:alert(1)'], ORG, SUPA)).toEqual([mine])
    expect(ownGalleryUrls(null, ORG, SUPA)).toEqual([])
  })

  test('an upload path must be this club\'s folder and a minted name', () => {
    expect(isOwnGalleryPath(`${ORG}/${FILE}.webp`, ORG)).toBe(true)
    expect(isOwnGalleryPath(`${OTHER}/${FILE}.webp`, ORG)).toBe(false)
    expect(isOwnGalleryPath(`${ORG}/../${OTHER}/${FILE}.webp`, ORG)).toBe(false)
    expect(isOwnGalleryPath(`${ORG}/${FILE}.html`, ORG)).toBe(false)
    expect(isOwnGalleryPath(`${ORG}/evil.jpg`, ORG)).toBe(false)
  })
})
