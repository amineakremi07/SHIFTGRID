import { expect, test } from '@playwright/test'

import { CALLBACK_ERROR_PATH, decideCallback, pathAfterVerify } from '../lib/auth-callback'
import { replayAllowed } from '../lib/consent'
import { displayAddress, formatReverseAddress } from '../lib/geocode'

/** Pure checks: the email-link callback decisions and the reverse-geocoding address format. */

const q = (s: string) => new URLSearchParams(s)
const HASH = 'abcdef0123456789abcdef0123456789'

test.describe('/auth/callback decisions', () => {
  test('an error from Supabase (expired link, access denied) is an error', () => {
    expect(decideCallback(q('error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'))).toEqual({ kind: 'error' })
    expect(decideCallback(q(`error_code=otp_expired&token_hash=${HASH}&type=invite`))).toEqual({ kind: 'error' })
  })

  test('token_hash + type is verified, with a safe next only', () => {
    expect(decideCallback(q(`token_hash=${HASH}&type=invite`))).toEqual({ kind: 'verify', tokenHash: HASH, type: 'invite', next: null })
    expect(decideCallback(q(`token_hash=${HASH}&type=signup&next=/courts`))).toMatchObject({ kind: 'verify', type: 'signup', next: '/courts' })
    for (const evil of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)']) {
      expect(decideCallback(q(`token_hash=${HASH}&type=magiclink&next=${encodeURIComponent(evil)}`))).toMatchObject({ kind: 'verify', next: null })
    }
  })

  test('a recovery is handed to /reset-password, never verified here', () => {
    expect(decideCallback(q(`token_hash=${HASH}&type=recovery`))).toEqual({
      kind: 'forward-recovery',
      path: `/reset-password?token_hash=${HASH}&type=recovery`,
    })
  })

  test('a PKCE code is exchanged; junk and unknown types are refused', () => {
    expect(decideCallback(q('code=0123abcd-4567-89ef-0123-456789abcdef'))).toMatchObject({ kind: 'exchange' })
    expect(decideCallback(q('code=x'))).toEqual({ kind: 'error' })
    expect(decideCallback(q(`token_hash=${HASH}&type=admin`))).toEqual({ kind: 'nothing' })
    expect(decideCallback(q('token_hash=a b&type=invite'))).toEqual({ kind: 'error' })
    expect(decideCallback(q(''))).toEqual({ kind: 'nothing' })
  })

  test('where a verified link goes', () => {
    expect(pathAfterVerify({ type: 'invite', next: '/courts', roleLanding: '/' })).toBe('/accept-invitation')
    expect(pathAfterVerify({ type: 'signup', next: '/courts', roleLanding: '/' })).toBe('/courts')
    expect(pathAfterVerify({ type: 'signup', next: null, roleLanding: '/dashboard/org' })).toBe('/dashboard/org')
    expect(pathAfterVerify({ redirectType: 'PASSWORD_RECOVERY', next: '/x', roleLanding: '/' })).toBe('/reset-password?code=1')
    expect(CALLBACK_ERROR_PATH).toBe('/login?error=link_invalid')
  })

  test('the new pages are never session-recorded', () => {
    for (const path of ['/auth/callback', '/accept-invitation', '/accept-invitation?x=1', '/forgot-password', '/reset-password']) {
      expect(replayAllowed(path), path).toBe(false)
    }
    expect(replayAllowed('/courts')).toBe(true)
  })
})

test.describe('reverse geocoding format', () => {
  const tunis = {
    display_name: 'whatever',
    address: { house_number: '12', road: 'Avenue Habib Bourguiba', suburb: 'Centre', city: 'Tunis', state: 'Tunis', postcode: '1001', country: 'Tunisie' },
  }

  test('"Street / Avenue, City, Postal Code, Country"', () => {
    expect(formatReverseAddress(tunis)).toEqual({
      address: '12 Avenue Habib Bourguiba, Tunis, 1001, Tunisie',
      street: '12 Avenue Habib Bourguiba',
      city: 'Tunis',
      postcode: '1001',
      country: 'Tunisie',
    })
  })

  test('skips what is unknown and falls back sensibly', () => {
    expect(formatReverseAddress({ address: { road: 'Rue de Marseille', town: 'La Marsa', country: 'Tunisie' } })?.address).toBe('Rue de Marseille, La Marsa, Tunisie')
    expect(formatReverseAddress({ address: { suburb: 'Lac 2', city: 'Tunis', postcode: '1053', country: 'Tunisie' } })?.address).toBe('Lac 2, Tunis, 1053, Tunisie')
    expect(formatReverseAddress({ address: { village: 'Sidi Bou Said', country: 'Tunisie' } })?.address).toBe('Sidi Bou Said, Tunisie')
  })

  test('does not repeat a street named after the town', () => {
    expect(formatReverseAddress({ address: { road: 'Tunis', city: 'Tunis', country: 'Tunisie' } })?.address).toBe('Tunis, Tunisie')
  })

  test('nothing useful, or not an address, is null (the form keeps what was typed)', () => {
    expect(formatReverseAddress({ address: { country: 'Tunisie', state: 'Tunis' } })).toBeNull()
    expect(formatReverseAddress({ error: 'Unable to geocode' })).toBeNull()
    for (const junk of [null, undefined, 5, 'x', [], {}]) expect(formatReverseAddress(junk)).toBeNull()
  })

  test('display address does not repeat the city', () => {
    expect(displayAddress('12 Avenue X, Tunis, 1001, Tunisie', 'Tunis')).toBe('12 Avenue X, Tunis, 1001, Tunisie')
    expect(displayAddress('12 Avenue X', 'Tunis')).toBe('12 Avenue X · Tunis')
    expect(displayAddress(null, 'Sfax')).toBe('Sfax')
    expect(displayAddress('Rue A', null)).toBe('Rue A')
    expect(displayAddress(null, null)).toBe('')
  })
})
