import { expect, test } from '@playwright/test'

import { createBookingSchema, guestBookingFormSchema, guestDetailsSchema, walkInBookingSchema } from '../lib/validations/booking'
import { ownerAccountSchema } from '../lib/validations/owner-signup'
import { playerRegisterSchema, playerSignUpSchema } from '../lib/validations/player-auth'

/** Pure schema checks (no browser, no database): bad payloads must die before Supabase. */

const inDays = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString()
const base = {
  orgId: '3f2b1c0e-8a1d-4e55-9c1a-2f6d8b7a1e10',
  courtId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  date: '2030-01-01',
  playerCount: 4,
}
const guest = { fullName: 'Amine Test', phone: '98 123 456' }

test.describe('booking schema', () => {
  const ok = () => ({ mode: 'guest' as const, ...base, startsAt: inDays(3), date: inDays(3).slice(0, 10), guest, consent: true })

  test('accepts a valid guest booking and canonicalises the phone', () => {
    const r = createBookingSchema.safeParse(ok())
    expect(r.success).toBe(true)
    if (r.success && r.data.mode === 'guest') expect(r.data.guest.phone).toBe('+21698123456')
  })

  test('requires the consent box to be ticked, server-side', () => {
    expect(createBookingSchema.safeParse({ ...ok(), consent: false }).success).toBe(false)
    const without: Record<string, unknown> = { ...ok() }
    delete without.consent
    expect(createBookingSchema.safeParse(without).success).toBe(false)
  })

  test('rejects forged server-owned fields (price, sport, end time)', () => {
    for (const extra of [{ amount: 1 }, { sport: 'padel' }, { endsAt: inDays(3) }, { profileId: base.orgId }]) {
      expect(createBookingSchema.safeParse({ ...ok(), ...extra }).success).toBe(false)
    }
  })

  test('rejects bad ids, dates and instants', () => {
    expect(createBookingSchema.safeParse({ ...ok(), courtId: 'not-a-uuid' }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), date: '2026-02-31' }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), startsAt: 'tomorrow' }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), startsAt: '2030-01-01T10:00:00' }).success).toBe(false) // no offset
    expect(createBookingSchema.safeParse({ ...ok(), startsAt: inDays(-30) }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), startsAt: inDays(400) }).success).toBe(false)
  })

  test('rejects impossible player counts', () => {
    for (const playerCount of [0, -1, 2.5, 31]) {
      expect(createBookingSchema.safeParse({ ...ok(), playerCount }).success).toBe(false)
    }
  })

  test('split invite emails: valid or blank only, only for split, never more than the other players', () => {
    const split = { ...ok(), payment: 'split' as const }
    const good = createBookingSchema.safeParse({ ...split, inviteEmails: ['A@B.tn', '', ' c@d.com '] })
    expect(good.success).toBe(true)
    if (good.success) expect(good.data.inviteEmails).toEqual(['a@b.tn', '', 'c@d.com'])
    expect(createBookingSchema.safeParse({ ...split, inviteEmails: ['nope'] }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...split, inviteEmails: ['a@b.tn', 'c@d.tn', 'e@f.tn', 'g@h.tn'] }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...split, playerCount: 2, inviteEmails: ['a@b.tn', 'c@d.tn'] }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), payment: 'cash', inviteEmails: ['a@b.tn'] }).success).toBe(false)
  })

  test('unknown payment choice and mode are refused', () => {
    expect(createBookingSchema.safeParse({ ...ok(), payment: 'bitcoin' }).success).toBe(false)
    expect(createBookingSchema.safeParse({ ...ok(), mode: 'admin' }).success).toBe(false)
  })
})

test.describe('guest details', () => {
  test('Tunisian mobile numbers only', () => {
    for (const phone of ['98123456', '+216 98 123 456', '0021698123456', '21 234 567', '55.123.456']) {
      expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone }).success, phone).toBe(true)
    }
    for (const phone of ['', '71123456', '31123456', '+33612345678', '9812345', '981234567', 'abcdefgh', '+216 98 123 45a']) {
      expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone }).success, phone).toBe(false)
    }
  })

  test('email is optional but must be real when given', () => {
    expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone: '98123456' }).success).toBe(true)
    expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone: '98123456', email: '  ' }).success).toBe(true)
    expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone: '98123456', email: 'x@y.tn' }).success).toBe(true)
    expect(guestDetailsSchema.safeParse({ fullName: 'Aa', phone: '98123456', email: 'x@' }).success).toBe(false)
  })

  test('names: 2-100 chars', () => {
    expect(guestDetailsSchema.safeParse({ fullName: 'A', phone: '98123456' }).success).toBe(false)
    expect(guestDetailsSchema.safeParse({ fullName: 'A'.repeat(101), phone: '98123456' }).success).toBe(false)
  })
})

test('walk-in schema is strict and shares the slot rules', () => {
  const valid = { courtId: base.courtId, date: inDays(2).slice(0, 10), startsAt: inDays(2), playerCount: 4, guest }
  expect(walkInBookingSchema.safeParse(valid).success).toBe(true)
  expect(walkInBookingSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false)
  expect(walkInBookingSchema.safeParse({ ...valid, date: '2026-13-01' }).success).toBe(false)
})

test.describe('consent is mandatory on every sign-up path', () => {
  const orgId = base.orgId
  const player = { fullName: 'Ali Ben Salah', email: 'ali@example.com', phone: '98123456', password: 'longenough1', orgId }

  test('player registration', () => {
    expect(playerRegisterSchema.safeParse({ ...player, acceptTerms: true }).success).toBe(true)
    expect(playerRegisterSchema.safeParse({ ...player, acceptTerms: false }).success).toBe(false)
    expect(playerRegisterSchema.safeParse(player).success).toBe(false)
  })

  test('player sign-up from the booking modal', () => {
    const modal = { displayName: 'Ali Ben Salah', email: 'ali@example.com', phone: '98123456', password: 'secret1', orgId }
    expect(playerSignUpSchema.safeParse({ ...modal, acceptTerms: true }).success).toBe(true)
    expect(playerSignUpSchema.safeParse({ ...modal, acceptTerms: false }).success).toBe(false)
    expect(playerSignUpSchema.safeParse(modal).success).toBe(false)
  })

  test('club owner account', () => {
    const owner = { ownerName: 'Owner One', ownerEmail: 'o@example.com', ownerPhone: '+216 98 123 456', password: 'longenough1', confirmPassword: 'longenough1' }
    expect(ownerAccountSchema.safeParse({ ...owner, acceptTerms: true }).success).toBe(true)
    expect(ownerAccountSchema.safeParse({ ...owner, acceptTerms: false }).success).toBe(false)
    expect(ownerAccountSchema.safeParse(owner).success).toBe(false)
  })

  test('the guest booking form needs consent but staff walk-ins do not', () => {
    expect(guestBookingFormSchema.safeParse({ ...guest, consent: true }).success).toBe(true)
    expect(guestBookingFormSchema.safeParse({ ...guest, consent: false }).success).toBe(false)
    expect(guestBookingFormSchema.safeParse(guest).success).toBe(false)
    expect(walkInBookingSchema.safeParse({ courtId: base.courtId, date: inDays(2).slice(0, 10), startsAt: inDays(2), playerCount: 4, guest }).success).toBe(true)
  })
})
