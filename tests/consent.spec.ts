import { expect, test } from '@playwright/test'

import { sanitizeEvent } from '../lib/analytics-sanitize'
import { CONSENT_VERSION, makeConsent, parseConsent, replayAllowed } from '../lib/consent'

/** Pure checks (no browser): the consent record, where recording may run, and recording URLs. */

const HEX48 = 'b'.repeat(24) + '0123456789ab'.repeat(2)

test.describe('consent record', () => {
  test('a valid stored choice round-trips', () => {
    const c = makeConsent(true, true, new Date('2026-10-03T10:00:00Z'))
    expect(parseConsent(JSON.stringify(c))).toEqual({ v: CONSENT_VERSION, analytics: true, replay: true, at: '2026-10-03T10:00:00.000Z' })
  })

  test('recordings can never be on without analytics', () => {
    expect(makeConsent(false, true).replay).toBe(false)
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: false, replay: true, at: '' }))?.replay).toBe(false)
  })

  test('missing, malformed, wrong-typed or old-version values mean "not chosen yet"', () => {
    for (const raw of [
      null,
      '',
      'yes',
      '{',
      '[]',
      JSON.stringify({ v: CONSENT_VERSION, analytics: 'true', replay: false }),
      JSON.stringify({ v: CONSENT_VERSION, analytics: true }),
      JSON.stringify({ v: CONSENT_VERSION - 1, analytics: true, replay: true, at: '' }),
    ]) {
      expect(parseConsent(raw), String(raw)).toBeNull()
    }
  })
})

test.describe('where session recording may run', () => {
  test('never on dashboards, admin, reservations, auth or invite pages', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/org/bookings',
      '/admin/verification',
      '/reservations',
      '/reservations/9f1c2a',
      '/reservations/join?token=abc',
      '/reservations/cancel-guest',
      '/accept-invite',
      '/login',
      '/login-owner',
      '/register',
      '/signup-owner',
      '/logout',
    ]) {
      expect(replayAllowed(path), path).toBe(false)
    }
  })

  test('allowed on public browsing pages', () => {
    for (const path of ['/', '/courts', '/courts/f350ebab-85d5-4846-8673-c2da58f96193', '/terms', '/privacy']) {
      expect(replayAllowed(path), path).toBe(true)
    }
    // Prefix look-alikes are not excluded by accident.
    expect(replayAllowed('/dashboards-info')).toBe(true)
    expect(replayAllowed('/registered-clubs')).toBe(true)
  })
})

test('recording meta events lose the query string (secret links)', () => {
  const event = {
    event: '$snapshot',
    properties: {
      $snapshot_data: [
        { type: 4, data: { href: `https://shiftgrid.tn/reservations/join?token=${HEX48}#x`, width: 1, height: 1 } },
        { type: 2, data: { node: {} } },
        { type: 3, data: { source: 0 } },
      ],
    },
  }
  const out = sanitizeEvent(event)
  expect((out.properties.$snapshot_data[0].data as { href: string }).href).toBe('https://shiftgrid.tn/reservations/join')
  expect(JSON.stringify(out)).not.toContain(HEX48)
})
