import { expect, test } from '@playwright/test'

import { confirmationEmail, type BookingFacts } from '../lib/notifications/templates'
import { bookingPassUrl, guestCancelUrl } from '../lib/notifications/urls'
import { forgotPasswordSchema, newPasswordSchema } from '../lib/validations/password-reset'

/** Pure checks for password recovery and the booking-pass link in emails (no browser, no database). */

const ORIGIN = 'https://shiftgridtn.vercel.app'
const ID = '3922dd5f-1d3f-4a6b-8c9d-1e2f3a4b5c6d'
const TOKEN = 'a'.repeat(48)
const facts: BookingFacts = {
  clubName: 'Padel Club',
  courtName: 'Court 1',
  sport: 'padel',
  date: 'Tue 3 Nov 2026',
  time: '18:00 – 19:30',
  reference: '3922DD5F',
  amount: 90,
  playerCount: 4,
}

test.describe('forgot / reset password schemas', () => {
  test('the email is trimmed, lower-cased and must be real', () => {
    const ok = forgotPasswordSchema.safeParse({ email: '  Amine@Example.COM ' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.email).toBe('amine@example.com')
    for (const bad of ['', 'nope', 'a@', '@b.com']) expect(forgotPasswordSchema.safeParse({ email: bad }).success).toBe(false)
  })

  test('a new password needs 8-72 characters and a matching confirmation', () => {
    expect(newPasswordSchema.safeParse({ password: 'longenough1', confirmPassword: 'longenough1' }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success).toBe(false)
    expect(newPasswordSchema.safeParse({ password: 'x'.repeat(73), confirmPassword: 'x'.repeat(73) }).success).toBe(false)
    expect(newPasswordSchema.safeParse({ password: 'x'.repeat(72), confirmPassword: 'x'.repeat(72) }).success).toBe(true)
    const mismatch = newPasswordSchema.safeParse({ password: 'longenough1', confirmPassword: 'longenough2' })
    expect(mismatch.success).toBe(false)
    if (!mismatch.success) expect(mismatch.error.flatten().fieldErrors.confirmPassword?.[0]).toBe('Les deux mots de passe ne correspondent pas')
  })
})

test.describe('booking pass link in emails', () => {
  test('a member link is exactly <app url>/reservations/<booking id>', () => {
    expect(bookingPassUrl(ORIGIN, ID)).toBe(`${ORIGIN}/reservations/${ID}`)
    expect(bookingPassUrl(`${ORIGIN}/`, ID)).toBe(`${ORIGIN}/reservations/${ID}`) // trailing slash in the env value
    expect(bookingPassUrl(ORIGIN, ID, null)).toBe(`${ORIGIN}/reservations/${ID}`)
  })

  test('a guest link carries the booking secret, otherwise the pass would answer 404', () => {
    expect(bookingPassUrl(ORIGIN, ID, TOKEN)).toBe(`${ORIGIN}/reservations/${ID}?token=${TOKEN}`)
    expect(guestCancelUrl(ORIGIN, TOKEN)).toBe(`${ORIGIN}/reservations/cancel-guest?token=${TOKEN}`)
  })

  test('the confirmation email button "Voir votre pass de réservation" points at that link', () => {
    for (const guestToken of [null, TOKEN]) {
      const passUrl = bookingPassUrl(ORIGIN, ID, guestToken)
      const mail = confirmationEmail({
        ...facts,
        recipientName: 'Sam',
        state: 'pay_at_club',
        paidNow: 0,
        passUrl,
        cancelUrl: null,
        invitesEmailed: 0,
        checkInCode: '782910',
      })
      expect(mail.html).toContain(`href="${passUrl}"`)
      expect(mail.html).toContain('Voir votre pass de réservation')
      expect(mail.text).toContain(`Votre pass : ${passUrl}`)
      expect(mail.html).toContain('<strong>782910</strong>')
    }
  })
})
