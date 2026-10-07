import { expect, test } from '@playwright/test'

import { buildDemandProfile, demandFor, fallbackDemand, venueWeekdayHour, DEMAND_MIN_SAMPLE } from '../lib/demand'
import { favouriteSlot, isRecommended } from '../lib/recommendations'
import { bookingRisk, tallyStatuses } from '../lib/risk'
import { clubFromParam } from '../lib/auth-callback'

// 2030-11-05 is a Tuesday. Venue time is UTC+1, so 17:00Z = 18:00 at the club.
const tue18 = (week: number) => new Date(Date.UTC(2030, 10, 5 + week * 7, 17, 0)).toISOString()
const tue09 = (week: number) => new Date(Date.UTC(2030, 10, 5 + week * 7, 8, 0)).toISOString()

test.describe('demand badges', () => {
  test('weekday and hour are read in venue time', () => {
    expect(venueWeekdayHour(tue18(0))).toEqual({ weekday: 2, hour: 18 })
    // 23:30Z is already the next day at the club.
    expect(venueWeekdayHour('2030-11-05T23:30:00.000Z')).toEqual({ weekday: 3, hour: 0 })
  })

  test('a young club uses the fixed rule: evenings busy, weekday afternoons quiet', () => {
    expect(fallbackDemand(2, 19)).toBe('high')
    expect(fallbackDemand(2, 13)).toBe('quiet')
    expect(fallbackDemand(6, 13)).toBe('normal')
    expect(demandFor(null, 2, 19)).toBe('high')
    expect(demandFor(buildDemandProfile([tue18(0)], 2, 1), 2, 13)).toBe('quiet')
  })

  test('with enough history the club\'s own numbers win', () => {
    // 2 courts, 8 weeks: Tuesday 18:00 taken on 2 courts every week (ratio 1), Tuesday 09:00 never.
    const starts = Array.from({ length: 8 }, (_, w) => [tue18(w), tue18(w)]).flat()
    const filler = Array.from({ length: DEMAND_MIN_SAMPLE }, (_, i) => new Date(Date.UTC(2030, 10, 6, 8 + (i % 3), 0)).toISOString())
    const profile = buildDemandProfile([...starts, ...filler], 2, 8)
    expect(demandFor(profile, 2, 18)).toBe('high')
    // Tuesday 09:00 has no bookings: quiet from data, although the fixed rule would say normal.
    expect(demandFor(profile, 2, 9)).toBe('quiet')
    expect(tue09(0)).toBeTruthy()
  })
})

test.describe('recommendations', () => {
  test('needs a habit: nothing from one booking, the repeated weekday + hour from several', () => {
    expect(favouriteSlot([tue18(0)])).toBeNull()
    const fav = favouriteSlot([tue18(0), tue18(1), tue09(2)])
    expect(fav).toEqual({ weekday: 2, hour: 18 })
    expect(isRecommended(tue18(5), fav)).toBe(true)
    expect(isRecommended(tue09(5), fav)).toBe(false)
    expect(isRecommended(tue18(5), null)).toBe(false)
  })
})

test.describe('no-show risk', () => {
  const base = { noShows: 0, cancellations: 0, totalBookings: 4, leadMinutes: 24 * 60, isGuest: false }

  test('a regular booker is low risk', () => {
    expect(bookingRisk(base)).toMatchObject({ score: 0, level: 'low' })
  })

  test('two no-shows are high risk, one is not', () => {
    expect(bookingRisk({ ...base, noShows: 2 }).level).toBe('high')
    expect(bookingRisk({ ...base, noShows: 1 }).level).toBe('low')
  })

  test('late bookings and unknown guests add up to medium', () => {
    const r = bookingRisk({ ...base, totalBookings: 0, isGuest: true, leadMinutes: 20 })
    expect(r.level).toBe('medium')
    expect(r.reasons).toEqual(['booked less than 30 minutes ahead', 'first booking as a guest'])
  })

  test('many cancellations count, and statuses are tallied', () => {
    const t = tallyStatuses(['cancelled', 'cancelled', 'confirmed', 'no_show'])
    expect(t).toEqual({ noShows: 1, cancellations: 2, totalBookings: 4 })
    expect(bookingRisk({ ...base, ...t }).reasons).toContain('many cancellations')
  })
})

test('club ids from callback links must be uuids', () => {
  expect(clubFromParam('3f1c2b5e-6d7a-4b8c-9d0e-1a2b3c4d5e6f')).toBe('3f1c2b5e-6d7a-4b8c-9d0e-1a2b3c4d5e6f')
  expect(clubFromParam("1' or '1'='1")).toBeNull()
  expect(clubFromParam(null)).toBeNull()
})
