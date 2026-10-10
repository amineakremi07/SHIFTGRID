import { expect, test } from '@playwright/test'

import { checkInQrPayload, parseCheckInInput } from '../lib/check-in-input'
import { CHECK_IN_QR_CID, confirmationEmail, type BookingFacts } from '../lib/notifications/templates'

/** Pure checks for the anti-no-show system (no browser, no database). */

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

const confirmation = (checkInCode: string | null) =>
  confirmationEmail({
    ...facts,
    recipientName: 'Sam',
    state: 'pay_at_club',
    paidNow: 0,
    passUrl: 'https://shiftgrid.test/reservations/abc',
    cancelUrl: null,
    invitesEmailed: 0,
    checkInCode,
  })

test.describe('check-in input', () => {
  test('reads a 6-digit code, with spaces or inside a scanned QR payload', () => {
    expect(parseCheckInInput('782910')).toEqual({ kind: 'code', code: '782910' })
    expect(parseCheckInInput(' 782 910 ')).toEqual({ kind: 'code', code: '782910' })
    expect(parseCheckInInput(checkInQrPayload('782910'))).toEqual({ kind: 'code', code: '782910' })
  })

  test('reads a booking reference and a booking id', () => {
    expect(parseCheckInInput('3922dd5f')).toEqual({ kind: 'reference', reference: '3922DD5F' })
    expect(parseCheckInInput('shiftgrid:booking:3922DD5F')).toEqual({ kind: 'reference', reference: '3922DD5F' })
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseCheckInInput(id)).toEqual({ kind: 'id', bookingId: id })
  })

  test('rejects anything else', () => {
    for (const bad of ['', '   ', '12345', '1234567', 'hello', "782910'; drop table bookings;--", 'shiftgrid:checkin:', null, undefined]) {
      expect(parseCheckInInput(bad as string | null | undefined)).toBeNull()
    }
  })
})

test.describe('confirmation email with a check-in code', () => {
  test('shows the code in bold, the QR image and the reception instruction', () => {
    const mail = confirmation('782910')
    expect(mail.html).toContain('<strong>782910</strong>')
    expect(mail.html).toContain(`src="cid:${CHECK_IN_QR_CID}"`)
    expect(mail.html).toContain("Présentez ce code ou ce QR code à l&#39;accueil du club pour valider votre arrivée.")
    expect(mail.text).toContain("Code d'arrivée : 782910")
    expect(mail.text).toContain("Présentez ce code ou ce QR code à l'accueil du club pour valider votre arrivée.")
  })

  test('has no check-in block without a code', () => {
    const mail = confirmation(null)
    expect(mail.html).not.toContain('cid:')
    expect(mail.html).not.toContain('Your check-in code')
    expect(mail.text).not.toContain('Check-in code')
  })

  test('escapes the code, so nothing hostile reaches the HTML', () => {
    const mail = confirmation('<b>x</b>')
    expect(mail.html).not.toContain('<b>x</b>')
  })
})
