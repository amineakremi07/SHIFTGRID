'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createBookingSchema, type CreateBookingInput } from '@/lib/validations/booking'
import { computePrice } from '@/lib/pricing'
import { generateCourtSlots } from '@/lib/court-slots'
import { addDays, minutesSinceVenueDayStart, timeToMinutes, venueDateString } from '@/lib/court-time'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'

/** How far ahead a slot can be booked. */
const MAX_DAYS_AHEAD = 60

export type BookingErrorCode =
  | 'invalid_input'
  | 'not_signed_in'
  | 'not_a_member'
  | 'unavailable'
  | 'invalid_slot'
  | 'slot_taken'
  | 'slot_in_past'
  | 'unknown'

export type BookingResult =
  | {
      ok: true
      bookingId: string
      /** Short code the player quotes at the club, e.g. "3922DD5F". */
      reference: string
      amount: number
      startsAt: string
      endsAt: string
    }
  | {
      ok: false
      code: BookingErrorCode
      message: string
      fieldErrors?: Record<string, string[] | undefined>
    }

const fail = (code: BookingErrorCode, message: string): BookingResult => ({ ok: false, code, message })

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/** Map a Postgres / PostgREST error from create_booking to something a player can act on. */
function mapDatabaseError(error: { code?: string; message?: string }): BookingResult {
  // 23P01 = exclusion_violation: the GiST constraint on court_slot_locks caught a
  // double booking (two players racing for the same court and time).
  if (error.code === '23P01') {
    return fail('slot_taken', 'This slot was just taken by another player. Please select another time.')
  }
  const message = error.message ?? ''
  if (message.includes('slot_in_past')) {
    return fail('slot_in_past', 'That time has already passed. Please select another slot.')
  }
  if (message.includes('not_a_member')) {
    return fail('not_a_member', 'Your account is not a member of this club. You can book as a guest instead.')
  }
  if (message.includes('invalid_court')) {
    return fail('unavailable', 'This court is no longer available for booking.')
  }
  if (error.code === '23514') {
    return fail('invalid_input', 'That number of players is not allowed for this sport.')
  }
  console.error('create_booking failed', { code: error.code, message })
  return fail('unknown', 'Something went wrong while booking. Please try again.')
}

/**
 * Create a booking (member or guest).
 *
 * The heavy lifting is the `create_booking` database function, which runs the
 * guest upsert, the booking (whose triggers derive times and create the
 * court_slot_locks row) and the payment record in ONE transaction. A racing
 * double booking raises 23P01 and rolls all of it back.
 *
 * Nothing security-relevant is taken from the browser: the sport and price come
 * from the court row, the member id from the verified session, and the start
 * time must be a real slot on that court's grid.
 */
export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const parsed = createBookingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'Please check your details and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  const data = parsed.data

  const admin = getSupabaseAdmin()

  // --- the court, from the database (never from the client) ---------------
  const { data: court } = await admin
    .from('courts')
    .select(
      'id, org_id, sport, status, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at'
    )
    .eq('id', data.courtId)
    .maybeSingle()

  if (!court || court.org_id !== data.orgId || court.status !== 'active' || !isSport(court.sport)) {
    return fail('unavailable', 'This court is no longer available for booking.')
  }
  const sport = court.sport

  const { data: org } = await admin
    .from('organizations')
    .select('status')
    .eq('id', data.orgId)
    .maybeSingle()
  if (org?.status !== 'approved') {
    return fail('unavailable', 'This club is not accepting bookings right now.')
  }

  // --- the slot must be a real slot, inside the booking window -------------
  const today = venueDateString()
  if (data.date < today || data.date > addDays(today, MAX_DAYS_AHEAD)) {
    return fail('invalid_slot', 'That date is not open for booking.')
  }
  const startsAtMs = Date.parse(data.startsAt)
  const onGrid = generateCourtSlots({
    sport,
    openTime: court.open_time,
    closeTime: court.close_time,
    dateStr: data.date,
    locks: [],
    now: new Date(0), // "past" is enforced by the database against the real clock
  }).some((slot) => Date.parse(slot.start) === startsAtMs)
  if (!onGrid) {
    return fail('invalid_slot', 'That time is not available on this court. Please pick a listed slot.')
  }

  if (!(PLAYER_COUNT_OPTIONS[sport] as readonly number[]).includes(data.playerCount)) {
    return fail('invalid_input', 'That number of players is not allowed for this sport.')
  }

  // --- price: same function the drawer used ---------------------------------
  const price = computePrice({
    pricePerHour: Number(court.price_per_hour),
    nightSurchargePerHour: Number(court.night_surcharge_per_hour),
    nightStartsAtMinutes: timeToMinutes(court.night_starts_at),
    startMinutes: minutesSinceVenueDayStart(data.startsAt, data.date),
    durationMinutes: SPORT_DURATION_MIN[sport],
  })

  // --- who is booking --------------------------------------------------------
  let profileId: string | undefined
  if (data.mode === 'member') {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return fail('not_signed_in', 'Please sign in to book as a member, or continue as a guest.')
    }
    profileId = user.id
  }

  const { data: booked, error } = await admin.rpc('create_booking', {
    p_org_id: data.orgId,
    p_court_id: data.courtId,
    p_sport: sport,
    p_starts_at: data.startsAt,
    p_player_count: data.playerCount,
    p_amount: price.total,
    p_profile_id: profileId,
    p_guest_name: data.mode === 'guest' ? data.guest.fullName : undefined,
    p_guest_phone: data.mode === 'guest' ? data.guest.phone : undefined,
  })

  if (error) return mapDatabaseError(error)

  const row = booked as {
    booking_id: string
    reference: string
    starts_at: string
    ends_at: string
    amount: number
  }
  return {
    ok: true,
    bookingId: row.booking_id,
    reference: row.reference,
    amount: Number(row.amount),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}
