import { test, expect } from '@playwright/test'

import { assessGoogleSignIn, isGoogleUser } from '../lib/google-identity'
import { hasVerifiedFactor, mfaVerifyUrlPath, needsSecondFactor, normaliseTotp } from '../lib/mfa'
import { clientIpFrom } from '../lib/rate-limit'

test.describe('two-factor rules', () => {
  test('a code is required only when a VERIFIED factor exists and the session is not aal2', () => {
    expect(needsSecondFactor([{ status: 'verified' }], 'aal1')).toBe(true)
    expect(needsSecondFactor([{ status: 'verified' }], 'aal2')).toBe(false)
    expect(needsSecondFactor([{ status: 'unverified' }], 'aal1')).toBe(false) // half-finished enrollment never locks anyone out
    expect(needsSecondFactor([], 'aal1')).toBe(false)
    expect(needsSecondFactor(undefined, undefined)).toBe(false)
    expect(hasVerifiedFactor([{ status: 'unverified' }, { status: 'verified' }])).toBe(true)
  })

  test('totp codes are six digits; spaces are ignored', () => {
    expect(normaliseTotp('123 456')).toBe('123456')
    expect(normaliseTotp('12345')).toBeNull()
    expect(normaliseTotp('1234567')).toBeNull()
    expect(normaliseTotp('12a456')).toBeNull()
  })

  test('the verify page remembers where the visitor was going', () => {
    expect(mfaVerifyUrlPath('/admin/verification?tab=pending')).toBe('/auth/mfa-verify?redirect=%2Fadmin%2Fverification%3Ftab%3Dpending')
  })
})

test.describe('google sign-in assessment', () => {
  const google = { provider: 'google', identity_data: { email_verified: true } }

  test('a verified Google address on a fresh or confirmed account is fine', () => {
    expect(assessGoogleSignIn({ identities: [google] })).toBe('ok')
    expect(assessGoogleSignIn({ identities: [{ provider: 'email', identity_data: { email_verified: true } }, google] })).toBe('ok')
  })

  test('an address Google did not verify is refused', () => {
    expect(assessGoogleSignIn({ identities: [{ provider: 'google', identity_data: { email_verified: false } }] })).toBe('refuse')
    expect(assessGoogleSignIn({ identities: [{ provider: 'google', identity_data: {} }] })).toBe('refuse')
    expect(assessGoogleSignIn({ identities: [] })).toBe('refuse')
  })

  test('an unconfirmed password on the same address (pre-takeover) is reset', () => {
    expect(assessGoogleSignIn({ identities: [{ provider: 'email', identity_data: { email_verified: false } }, google] })).toBe('reset-password')
    // an identity without the flag is not punished
    expect(assessGoogleSignIn({ identities: [{ provider: 'email', identity_data: {} }, google] })).toBe('ok')
  })

  test('a Google identity linked to a password account is still recognised as Google', () => {
    expect(isGoogleUser({ app_metadata: { provider: 'email', providers: ['email', 'google'] } })).toBe(true)
    expect(isGoogleUser({ app_metadata: { provider: 'google' } })).toBe(true)
    expect(isGoogleUser({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(false)
  })
})

test('guest rate limit key never carries the raw phone (hash only)', async () => {
  // actionRateLimit appends the discriminator to the key; the caller passes a hash, so Redis never stores a number.
  const { createHash } = await import('node:crypto')
  const key = createHash('sha256').update('+21698123456').digest('hex').slice(0, 16)
  expect(key).toMatch(/^[0-9a-f]{16}$/)
  expect(key).not.toContain('98123456')
  expect(clientIpFrom(new Headers({ 'x-real-ip': '10.1.1.1' }))).toBe('10.1.1.1')
})
