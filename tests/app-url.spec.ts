import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { DEFAULT_APP_URL, resolveAppUrl } from '../lib/app-url'
import { confirmationEmail, type BookingFacts } from '../lib/notifications/templates'
import { bookingPassUrl } from '../lib/notifications/urls'

/** Pure checks for the origin used in every emailed link, and the pass button built from it. */

const ID = '3922dd5f-1d3f-4a6b-8c9d-1e2f3a4b5c6d'
const TOKEN = '0123456789abcdef'.repeat(3)
const facts: BookingFacts = {
  clubName: 'Padel Club', courtName: 'Court 1', sport: 'padel', date: 'Tue 3 Nov 2026',
  time: '18:00 – 19:30', reference: '3922DD5F', amount: 90, playerCount: 4,
}

test.describe('the app URL used in emails', () => {
  test('the default is the production site', () => {
    expect(DEFAULT_APP_URL).toBe('https://shiftgridtn.vercel.app')
  })

  test('NEXT_PUBLIC_APP_URL wins; a trailing slash is dropped', () => {
    expect(resolveAppUrl('https://example.test')).toBe('https://example.test')
    expect(resolveAppUrl('https://example.test/')).toBe('https://example.test')
    expect(resolveAppUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveAppUrl('  https://example.test  ')).toBe('https://example.test')
  })

  test('unset, blank or malformed falls back to the production site (never "undefined")', () => {
    for (const bad of [undefined, null, '', '   ', 'undefined', 'localhost:3000', 'ftp://x', 'not a url']) {
      expect(resolveAppUrl(bad as string | undefined), String(bad)).toBe(DEFAULT_APP_URL)
    }
  })
})

test.describe('the "Voir votre pass de réservation" button', () => {
  test('is <app url>/reservations/<id>?token=<token> for a member and for a guest alike', () => {
    const url = bookingPassUrl(resolveAppUrl(undefined), ID, TOKEN)
    expect(url).toBe(`https://shiftgridtn.vercel.app/reservations/${ID}?token=${TOKEN}`)
    const mail = confirmationEmail({
      ...facts, recipientName: 'Sam', state: 'pay_at_club', paidNow: 0, passUrl: url, cancelUrl: null, invitesEmailed: 0, checkInCode: '782910',
    })
    expect(mail.html).toContain(`href="${url}"`)
    expect(mail.html).toContain('Voir votre pass de réservation')
    expect(mail.text).toContain(`Votre pass : ${url}`)
  })

  test('without a token (old bookings, reminders) it is the plain sign-in link', () => {
    expect(bookingPassUrl(DEFAULT_APP_URL, ID)).toBe(`https://shiftgridtn.vercel.app/reservations/${ID}`)
  })
})

test.describe('the token reaches the email', () => {
  const read = (path: string) => readFileSync(path, 'utf8')

  test('both booking paths hand the pass token to the confirmation email', () => {
    expect(read('lib/actions/booking.ts')).toContain('passToken: row.pass_token')
    expect(read('lib/manual-booking.ts')).toContain('passToken: row.pass_token')
  })

  test('the email service builds the button from the pass token (members) or the guest token', () => {
    expect(read('lib/notifications/service.ts')).toContain('bookingPassUrl(input.origin, ctx.bookingId, input.passToken ?? input.guestToken)')
  })

  test('every emailed link uses the one origin helper (no host guessing, no second copy)', () => {
    expect(read('lib/notifications/origin.ts')).toContain('resolveAppUrl()')
    expect(read('lib/actions/staff-invites.ts')).toContain('resolveAppUrl')
    expect(read('lib/actions/staff-invites.ts')).not.toContain('x-forwarded-host')
  })

  test('a read-only pass link can never act as the organiser or cancel', () => {
    expect(read('lib/actions/payments.ts')).toContain("access.viewer === 'pass'")
    expect(read('app/reservations/[id]/page.tsx')).toContain("pass.viewer === 'owner' || pass.viewer === 'guest'")
  })
})
