import type { SupabaseClient } from '@supabase/supabase-js'

import { addDays, minutesSinceVenueDayStart, timeToMinutes, venueDateString } from '@/lib/court-time'
import { generateCourtSlots } from '@/lib/court-slots'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { computePrice, type PriceBreakdown } from '@/lib/pricing'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import type { Database } from '@/lib/types/database'

/** How far ahead a slot can be booked. */
export const MAX_DAYS_AHEAD = 60

export type SlotCheckError = {
  ok: false
  code: 'invalid_input' | 'unavailable' | 'invalid_slot'
  message: string
}

export type SlotCheckOk = { ok: true; sport: Sport; price: PriceBreakdown }

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/**
 * Everything both booking paths (player drawer, staff walk-in) must agree on:
 * the court is active and belongs to the org, the org is approved, the start is
 * a real slot of that day's hours, the player count is legal, and the price.
 * All read from the database with the service-role client; nothing from the browser.
 */
export async function checkBookableSlot(
  admin: SupabaseClient<Database>,
  input: { orgId: string; courtId: string; date: string; startsAt: string; playerCount: number }
): Promise<SlotCheckOk | SlotCheckError> {
  const { data: court } = await admin
    .from('courts')
    .select('id, org_id, sport, status, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
    .eq('id', input.courtId)
    .maybeSingle()

  if (!court || court.org_id !== input.orgId || court.status !== 'active' || !isSport(court.sport)) {
    return { ok: false, code: 'unavailable', message: 'This court is no longer available for booking.' }
  }
  const sport = court.sport

  const { data: org } = await admin
    .from('organizations')
    .select('status, weekly_hours')
    .eq('id', input.orgId)
    .maybeSingle()
  if (org?.status !== 'approved') {
    return { ok: false, code: 'unavailable', message: 'This club is not accepting bookings right now.' }
  }

  const today = venueDateString()
  if (input.date < today || input.date > addDays(today, MAX_DAYS_AHEAD)) {
    return { ok: false, code: 'invalid_slot', message: 'That date is not open for booking.' }
  }

  const hours = effectiveHours(parseWeeklyHours(org.weekly_hours), input.date, court)
  if (!hours) {
    return { ok: false, code: 'invalid_slot', message: 'The club is closed on that day.' }
  }

  const startsAtMs = Date.parse(input.startsAt)
  const onGrid = generateCourtSlots({
    sport,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    dateStr: input.date,
    locks: [],
    now: new Date(0), // "past" is enforced by the database against the real clock
  }).some((slot) => Date.parse(slot.start) === startsAtMs)
  if (!onGrid) {
    return { ok: false, code: 'invalid_slot', message: 'That time is not available on this court. Please pick a listed slot.' }
  }

  if (!(PLAYER_COUNT_OPTIONS[sport] as readonly number[]).includes(input.playerCount)) {
    return { ok: false, code: 'invalid_input', message: 'That number of players is not allowed for this sport.' }
  }

  const price = computePrice({
    pricePerHour: Number(court.price_per_hour),
    nightSurchargePerHour: Number(court.night_surcharge_per_hour),
    nightStartsAtMinutes: timeToMinutes(court.night_starts_at),
    startMinutes: minutesSinceVenueDayStart(input.startsAt, input.date),
    durationMinutes: SPORT_DURATION_MIN[sport],
  })

  return { ok: true, sport, price }
}
