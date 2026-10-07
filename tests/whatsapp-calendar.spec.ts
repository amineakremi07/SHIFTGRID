import { expect, test } from '@playwright/test'

import { googleCalendarUrl, icsContent, bookingCalendarEvent } from '../lib/calendar'
import { confirmationEmail, reminderEmail, type BookingFacts } from '../lib/notifications/templates'
import { bookingWhatsappLink, normalizeWhatsapp, resolveContactNumber } from '../lib/whatsapp'

const event = bookingCalendarEvent({
  bookingId: 'b1b2c3d4-0000-4000-8000-000000000001',
  clubName: 'Padel, Club; Tunis',
  courtName: 'Court 1',
  sport: 'padel',
  startsAt: '2030-11-03T17:00:00.000Z',
  endsAt: '2030-11-03T18:30:00.000Z',
  address: '29 Avenue du Ghana, Tunis',
  reference: 'ABCD1234',
})

const facts: BookingFacts = {
  clubName: 'Padel Club', courtName: 'Court 1', sport: 'padel', date: 'Sun 3 Nov 2030', time: '18:00 – 19:30',
  reference: 'ABCD1234', amount: 60, playerCount: 4,
  whatsappUrl: bookingWhatsappLink('98123456', { clubName: 'Padel Club', date: 'Sun 3 Nov 2030', time: '18:00 – 19:30' }),
  calendar: event,
}

test.describe('whatsapp', () => {
  test('numbers are normalised to international digits', () => {
    expect(normalizeWhatsapp('98 123 456')).toBe('21698123456')
    expect(normalizeWhatsapp('+216 98 123 456')).toBe('21698123456')
    expect(normalizeWhatsapp('00216 98123456')).toBe('21698123456')
    expect(normalizeWhatsapp('+33 6 12 34 56 78')).toBe('33612345678')
    expect(normalizeWhatsapp('abc')).toBeNull()
    expect(normalizeWhatsapp('123')).toBeNull()
    expect(normalizeWhatsapp('')).toBeNull()
  })

  test('link carries the club number and an encoded message with date, time and club', () => {
    const url = bookingWhatsappLink('98123456', { clubName: 'Padel Club', date: 'Sun 3 Nov 2030', time: '18:00 – 19:30' })!
    expect(url.startsWith('https://wa.me/21698123456?text=')).toBe(true)
    const text = decodeURIComponent(url.split('?text=')[1])
    expect(text).toContain('Padel Club')
    expect(text).toContain('Sun 3 Nov 2030')
    expect(text).toContain('18:00 – 19:30')
  })

  test('falls back to the platform contact, or nothing, when the club has no number', () => {
    const saved = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
    delete process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
    expect(resolveContactNumber(null)).toBeNull()
    expect(bookingWhatsappLink(null, { clubName: 'x', date: 'd', time: 't' })).toBeNull()
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP = '+216 71 000 000'
    expect(resolveContactNumber(null)).toEqual({ number: '21671000000', isFallback: true })
    expect(resolveContactNumber('98123456')).toEqual({ number: '21698123456', isFallback: false })
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
    else process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP = saved
  })
})

test.describe('calendar', () => {
  test('google link carries the UTC times, title and location', () => {
    const u = new URL(googleCalendarUrl(event))
    expect(u.searchParams.get('dates')).toBe('20301103T170000Z/20301103T183000Z')
    expect(u.searchParams.get('text')).toBe('Padel at Padel, Club; Tunis')
    expect(u.searchParams.get('location')).toContain('29 Avenue du Ghana')
  })

  test('ics is valid, escaped and CRLF terminated', () => {
    const ics = icsContent(event, new Date('2030-01-01T00:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20301103T170000Z')
    expect(ics).toContain('DTEND:20301103T183000Z')
    expect(ics).toContain('SUMMARY:Padel at Padel' + String.fromCharCode(92) + ', Club' + String.fromCharCode(92) + '; Tunis')
    expect(ics).toContain('UID:b1b2c3d4-0000-4000-8000-000000000001@shiftgrid')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})

test.describe('emails', () => {
  const base = { ...facts, recipientName: 'Sami', state: 'confirmed' as const, paidNow: 60, passUrl: 'https://x.test/p', cancelUrl: null, invitesEmailed: 0 }

  test('confirmation has the WhatsApp and calendar actions', () => {
    const r = confirmationEmail(base)
    expect(r.html).toContain('wa.me/21698123456')
    expect(r.html).toContain('calendar.google.com')
    expect(r.html).toContain('booking.ics')
    expect(r.text).toContain('wa.me/21698123456')
  })

  test('reminder has WhatsApp but no ics promise; without a number the button is gone', () => {
    const r = reminderEmail({ ...facts, recipientName: 'Sami', state: 'confirmed', dueAtClub: 0, unpaidShares: 0, passUrl: null })
    expect(r.html).toContain('wa.me/')
    expect(r.html).not.toContain('booking.ics')
    const none = confirmationEmail({ ...base, whatsappUrl: null })
    expect(none.html).not.toContain('wa.me')
  })
})
