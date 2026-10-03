'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'

import { GUEST_TOKEN_PATTERN, hashGuestToken } from '@/lib/guest-cancel'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { notifyCancellation } from '@/lib/notifications/service'
import { createClient } from '@/lib/supabase/server'

export type CancelBookingResult = { ok: true } | { ok: false; message: string }

const cancelSchema = z.object({
  bookingId: z.string().uuid(),
  /** A guest's secret cancel token (from their confirmation link). */
  guestToken: z.string().regex(GUEST_TOKEN_PATTERN).optional(),
  reason: z
    .string()
    .trim()
    .max(300, 'The reason is too long (300 characters max).')
    .optional()
    .transform((v) => (v ? v : undefined)),
})

export type CancelBookingInput = z.input<typeof cancelSchema>

const OPEN = ['pending_payment', 'confirmed'] as const

/**
 * Cancel a booking, as the player who made it or as staff of the club.
 *
 * Cancelling is just `status = 'cancelled'`: the `handle_booking_cancellation`
 * trigger (it takes no argument, it is a trigger function) deletes the
 * court_slot_locks row, which frees the slot and, through Realtime, updates every
 * open browser. The update runs as the caller, so the `bookings` RLS policies are
 * a second lock behind the checks here.
 *
 *  - Player (`booker_profile_id = user`): only until `cancellation_deadline`
 *    (24 h before the start), which the RLS policy enforces as well.
 *  - Staff (`org_admin` / `staff` of the booking's org): any open booking that has
 *    not finished, including inside the 24 h window.
 */
export async function cancelBookingAction(input: CancelBookingInput): Promise<CancelBookingResult> {
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  }
  const { bookingId, reason, guestToken } = parsed.data

  if (guestToken) return cancelAsGuest(bookingId, guestToken, reason)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in to cancel a booking.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .maybeSingle()

  // RLS already limits this to the caller's own bookings or their club's.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, org_id, booker_profile_id, status, ends_at, cancellation_deadline')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { ok: false, message: 'Booking not found.' }

  const isOwner = booking.booker_profile_id === user.id
  const isStaff =
    (profile?.role === 'org_admin' || profile?.role === 'staff') && profile.org_id === booking.org_id
  if (!isOwner && !isStaff) return { ok: false, message: 'You cannot cancel this booking.' }

  if (!(OPEN as readonly string[]).includes(booking.status)) {
    return { ok: false, message: 'This booking is already cancelled or finished.' }
  }

  const now = Date.now()
  if (now >= Date.parse(booking.ends_at)) {
    return { ok: false, message: 'This booking has already taken place.' }
  }
  if (!isStaff && now >= Date.parse(booking.cancellation_deadline)) {
    return {
      ok: false,
      message: 'Free cancellation closed 24 hours before the start. Please contact the club.',
    }
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: reason ?? null })
    .eq('id', bookingId)
    .in('status', [...OPEN])
    .select('id')

  if (error) {
    console.error('cancelBookingAction failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not cancel the booking. Please try again.' }
  }
  // Zero rows: lost a race with another cancellation, or RLS refused it.
  if (!updated?.length) return { ok: false, message: 'This booking could not be cancelled. Please refresh.' }

  revalidatePath(`/courts/${booking.org_id}`)
  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/reservations')
  // Tell the booker, after the response (never throws, never blocks the cancel).
  const by = isOwner ? 'you' : 'club'
  after(async () => {
    await notifyCancellation({ bookingId, by })
  })
  return { ok: true }
}

/**
 * A guest (no account) cancelling with the secret link. RLS cannot identify a
 * guest, so this runs with the service role after proving ownership: the presented
 * token must hash to the one stored on THIS booking. Same 24 h window as members.
 * Every failure to match says the same thing, so a probe learns nothing.
 */
async function cancelAsGuest(bookingId: string, token: string, reason: string | undefined): Promise<CancelBookingResult> {
  const invalid: CancelBookingResult = { ok: false, message: 'This cancellation link is not valid.' }
  const admin = getSupabaseAdmin()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, org_id, status, ends_at, cancellation_deadline')
    .eq('id', bookingId)
    .eq('guest_cancel_token_hash', hashGuestToken(token))
    .maybeSingle()
  if (!booking) return invalid

  if (!(OPEN as readonly string[]).includes(booking.status)) {
    return { ok: false, message: 'This booking is already cancelled or finished.' }
  }
  const now = Date.now()
  if (now >= Date.parse(booking.ends_at)) return { ok: false, message: 'This booking has already taken place.' }
  if (now >= Date.parse(booking.cancellation_deadline)) {
    return { ok: false, message: 'Free cancellation closed 24 hours before the start. Please contact the club.' }
  }

  const { data: updated, error } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: reason ?? 'Cancelled by guest' })
    .eq('id', booking.id)
    .in('status', [...OPEN])
    .select('id')
  if (error) {
    console.error('guest cancel failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not cancel the booking. Please try again.' }
  }
  if (!updated?.length) return { ok: false, message: 'This booking could not be cancelled. Please refresh.' }

  revalidatePath(`/courts/${booking.org_id}`)
  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/reservations/cancel-guest')
  after(async () => {
    await notifyCancellation({ bookingId: booking.id, by: 'you' })
  })
  return { ok: true }
}
