import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { checkBookableSlot } from '@/lib/booking-core'
import { timeToMinutes, venueInstant } from '@/lib/court-time'
import { appOrigin } from '@/lib/notifications/origin'
import { notifyBookingCreated } from '@/lib/notifications/service'
import { reportServerError } from '@/lib/observability'
import { captureAudit, captureRateLimit, timed } from '@/lib/telemetry'
import { PLAYER_COUNT_OPTIONS, type Sport } from '@/lib/slot-duration'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { manualBookingSchema } from '@/lib/validations/booking'

/**
 * A booking made by club staff for a customer at the desk or on the phone.
 * Server only. Same engine as the public flow: `checkBookableSlot` (court, hours, grid,
 * players, price from the database) then the atomic `create_booking()` RPC, whose GiST
 * constraint is the real "already booked" check, so two staff members racing for the same
 * slot cannot both win. `orgId` comes from the verified session or API key, never the body.
 *
 * Payment: "paid on site" records the cash as paid and confirms the booking at once;
 * "pay at venue" leaves it `pending_payment` until staff press Mark paid.
 */

export type ManualBookingSuccess = {
  ok: true
  bookingId: string
  reference: string
  courtId: string
  courtName: string
  startsAt: string
  endsAt: string
  status: 'confirmed' | 'pending_payment'
  paymentStatus: 'paid' | 'pending'
  amount: number
  /** What the customer shows at reception; staff can read it out on the phone. */
  checkInCode: string | null
  /** An email address was given, so the confirmation (with the code and QR) is on its way. */
  emailQueued: boolean
}

export type ManualBookingFailure = {
  ok: false
  status: 400 | 404 | 409 | 422 | 500
  code: 'invalid_input' | 'court_not_found' | 'slot_taken' | 'slot_in_past' | 'invalid_slot' | 'unavailable' | 'unknown'
  message: string
  fieldErrors?: Record<string, string[] | undefined>
}

const fail = (
  status: ManualBookingFailure['status'],
  code: ManualBookingFailure['code'],
  message: string,
  fieldErrors?: ManualBookingFailure['fieldErrors']
): ManualBookingFailure => ({ ok: false, status, code, message, fieldErrors })

export async function createManualBooking(...args: Parameters<typeof createManualBookingImpl>): ReturnType<typeof createManualBookingImpl> {
  return timed('api.booking.manual', () => createManualBookingImpl(...args))
}

async function createManualBookingImpl(orgId: string, rawInput: unknown): Promise<ManualBookingSuccess | ManualBookingFailure> {
  const parsed = manualBookingSchema.safeParse(rawInput)
  if (!parsed.success) {
    return fail(400, 'invalid_input', 'Please check the details and try again.', parsed.error.flatten().fieldErrors)
  }
  const data = parsed.data
  const admin = getSupabaseAdmin()

  // The court must belong to the caller's club; another club's court looks like a missing one.
  const { data: court } = await admin.from('courts').select('id, org_id, sport, name').eq('id', data.court_id).maybeSingle()
  if (!court || court.org_id !== orgId) return fail(404, 'court_not_found', 'Court not found.')

  const startsAt = data.starts_at ?? venueInstant(data.date, timeToMinutes(data.start_time!)).toISOString()
  const options = PLAYER_COUNT_OPTIONS[court.sport as Sport] as readonly number[] | undefined
  const playerCount = data.player_count ?? options?.[0] ?? 4

  const checked = await checkBookableSlot(admin, { orgId, courtId: court.id, date: data.date, startsAt, playerCount })
  if (!checked.ok) {
    return fail(checked.code === 'invalid_input' ? 400 : 422, checked.code === 'invalid_input' ? 'invalid_input' : checked.code, checked.message)
  }

  const paid = data.payment_status === 'paid_on_site'
  const { data: booked, error } = await admin.rpc('create_booking', {
    p_org_id: orgId,
    p_court_id: court.id,
    p_sport: checked.sport,
    p_starts_at: startsAt,
    p_player_count: playerCount,
    p_amount: checked.price.total,
    p_guest_name: data.full_name,
    p_guest_phone: data.phone,
    p_status: paid ? 'confirmed' : 'pending_payment',
    p_source: data.source,
    p_notes: data.notes,
    p_paid: paid,
  })

  if (error) {
    // 23P01 (overlapping lock) or 23505 on the lock's primary key (identical start): the slot is gone.
    if (error.code === '23P01' || (error.code === '23505' && error.message.includes('court_slot_locks'))) {
      captureRateLimit({ route: 'booking.manual', limit: 1, remaining: 0, source: 'slot_lock' })
      return fail(409, 'slot_taken', 'Slot already booked')
    }
    if (error.message.includes('slot_in_past')) return fail(422, 'slot_in_past', 'That time has already started. Pick a later slot.')
    if (error.message.includes('guest_details_required')) return fail(400, 'invalid_input', 'Please enter the customer name.')
    console.error('manual booking failed', { code: error.code, message: error.message })
    reportServerError('booking.manual', new Error(`create_booking failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return fail(500, 'unknown', 'Could not create the booking. Please try again.')
  }

  const row = booked as {
    booking_id: string
    reference: string
    starts_at: string
    ends_at: string
    amount: number
    cancel_token: string | null
    pass_token: string | null
    check_in_code: string | null
  }

  // Audit trail: a booking made by the club (desk or phone), not by the player.
  captureAudit({
    action: 'booking.manual_create',
    status: paid ? 'confirmed' : 'pending_payment',
    booking_id: row.booking_id,
    court_id: court.id,
    org_id: orgId,
    actor: 'staff',
    detail: data.source,
  })

  // The customer's confirmation (with the check-in code and QR) goes out after the response.
  if (data.email) {
    const origin = await appOrigin()
    const email = data.email
    after(async () => {
      await notifyBookingCreated({
        bookingId: row.booking_id,
        origin,
        guestToken: row.cancel_token,
        passToken: row.pass_token,
        guestEmail: email,
        paidNow: paid ? Number(row.amount) : 0,
        invites: [],
      })
    })
  }

  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/dashboard/org/analytics')
  revalidatePath(`/courts/${orgId}`)

  return {
    ok: true,
    bookingId: row.booking_id,
    reference: row.reference,
    courtId: court.id,
    courtName: court.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: paid ? 'confirmed' : 'pending_payment',
    paymentStatus: paid ? 'paid' : 'pending',
    amount: Number(row.amount),
    checkInCode: row.check_in_code,
    emailQueued: Boolean(data.email),
  }
}
