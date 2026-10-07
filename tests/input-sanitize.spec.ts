import { expect, test } from '@playwright/test'

import { stripHtml } from '../lib/sanitize-text'
import { createBookingSchema, guestDetailsSchema, manualBookingSchema } from '../lib/validations/booking'

test.describe('input sanitising', () => {
  test('stripHtml removes tags, script bodies and stray brackets', () => {
    expect(stripHtml('  <b>Ali</b> <script>alert(1)</script>Ben  ')).toBe('Ali Ben')
    expect(stripHtml('Sam<img src=x onerror=alert(1)')).toBe('Sam')
    expect(stripHtml('a < b')).toBe('a b')
    expect(stripHtml('Leïla\u0000 B')).toBe('Leïla B')
  })

  test('guest name is stripped and a markup-only name is refused', () => {
    const ok = guestDetailsSchema.safeParse({ fullName: ' <i>Mona</i> Trabelsi ', phone: '98123456' })
    expect(ok.success && ok.data.fullName).toBe('Mona Trabelsi')
    expect(guestDetailsSchema.safeParse({ fullName: '<b></b>', phone: '98123456' }).success).toBe(false)
  })

  test('manual booking notes are stripped', () => {
    const r = manualBookingSchema.safeParse({
      court_id: '3f1c2b5e-6d7a-4b8c-9d0e-1a2b3c4d5e6f', date: '2030-01-01', start_time: '10:00',
      full_name: 'Sami', payment_status: 'pay_at_venue', notes: 'call <script>x()</script>back',
    })
    expect(r.success && r.data.notes).toBe('call back')
  })

  test('booking schema accepts the honeypot field but stays strict', () => {
    const base = { mode: 'member', orgId: '3f1c2b5e-6d7a-4b8c-9d0e-1a2b3c4d5e6f', courtId: '3f1c2b5e-6d7a-4b8c-9d0e-1a2b3c4d5e6f', date: '2030-01-01', startsAt: new Date(Date.now() + 5 * 864e5).toISOString(), playerCount: 4 }
    expect(createBookingSchema.safeParse({ ...base, website: 'http://spam' }).success).toBe(true)
    expect(createBookingSchema.safeParse({ ...base, amount: 1 }).success).toBe(false)
  })
})
