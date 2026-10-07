'use server'

import { after } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { captureAudit, captureBooking, captureRateLimit, timed } from '@/lib/telemetry'
import { notifyBookingCreated } from '@/lib/notifications/service'
import { appOrigin } from '@/lib/notifications/origin'
import { emailEnabled } from '@/lib/notifications/mailer'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createBookingSchema, type CreateBookingInput } from '@/lib/validations/booking'
import { checkBookableSlot } from '@/lib/booking-core'
import { formatVenueDate, timeSlotLabel, venueDateString } from '@/lib/court-time'
import { guestCancelPath } from '@/lib/guest-cancel'
import { canSplit, onlinePaymentMode, onlineProvider, shareInvitePath, type PaymentChoice } from '@/lib/payments'

export type BookingErrorCode =
  | 'invalid_input'
  | 'not_signed_in'
  | 'not_a_member'
  | 'account_suspended'
  | 'unavailable'
  | 'invalid_slot'
  | 'slot_taken'
  | 'slot_in_past'
  | 'payment_unavailable'
  | 'payment_failed'
  | 'rate_limited'
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
      /** Guests only: a secret link to cancel without an account. Shown once. */
      cancelPath: string | null
      /** Confirmed once fully paid; otherwise held and awaiting payment. */
      status: 'confirmed' | 'pending_payment'
      payment: PaymentChoice
      /** What the booker paid just now (0 for cash). */
      paidNow: number
      /** Split only: one secret link per other player, shown once. */
      invites: { shareNo: number; amount: number; path: string }[]
      /** The booking's pass page. Guests carry their secret in the link. */
      passPath: string
      /** Whether emails are being sent at all (a provider is configured). */
      emailsEnabled: boolean
    }
  | {
      ok: false
      code: BookingErrorCode
      message: string
      fieldErrors?: Record<string, string[] | undefined>
    }

const fail = (code: BookingErrorCode, message: string): BookingResult => ({ ok: false, code, message })

/** Map a Postgres / PostgREST error from create_booking to something a player can act on. */
function mapDatabaseError(error: { code?: string; message?: string }): BookingResult {
  // 23P01 = exclusion_violation: the GiST constraint on court_slot_locks caught a
  // double booking (two players racing for the same court and time).
  // An identical start time collides on the (court_id, occupied_from) primary key
  // first, which is 23505 rather than 23P01; both mean "someone else got it".
  if (error.code === '23P01' || (error.code === '23505' && error.message?.includes('court_slot_locks'))) {
    // Lost the race for a slot: reported like a throttle (limit 1 per slot, none left).
    captureRateLimit({ route: 'booking.create', limit: 1, remaining: 0, source: 'slot_lock' })
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
  reportServerError('booking.create', new Error(`create_booking failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
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
export async function createBooking(...args: Parameters<typeof createBookingImpl>): ReturnType<typeof createBookingImpl> {
  return timed('action.booking.create', () => createBookingImpl(...args))
}

async function createBookingImpl(input: CreateBookingInput): Promise<BookingResult> {
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

  // Honeypot: a person never sees this field. Answer a bot with a believable success and do nothing
  // (no slot held, no email, no database write), so it has no signal to adapt to.
  if (data.website) {
    captureAudit({ action: 'booking.honeypot', status: 'blocked', actor: data.mode })
    const id = crypto.randomUUID()
    return {
      ok: true,
      bookingId: id,
      reference: id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      amount: 0,
      startsAt: data.startsAt,
      endsAt: data.startsAt,
      cancelPath: null,
      status: 'pending_payment',
      payment: 'cash',
      paidNow: 0,
      invites: [],
      passPath: '/',
      emailsEnabled: false,
    }
  }

  // Slot hogging guard: members are counted per account, guests per IP. Runs after
  // validation (so junk is cheap to refuse) and before any database work.
  let memberId: string | undefined
  if (data.mode === 'member') {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser()
    memberId = user?.id
  }
  const limited = await actionRateLimit('booking', memberId)
  if (limited) return fail('rate_limited', limited)

  const admin = getSupabaseAdmin()

  // --- court, slot, hours, player count and price: one shared check ---------
  const checked = await checkBookableSlot(admin, {
    orgId: data.orgId,
    courtId: data.courtId,
    date: data.date,
    startsAt: data.startsAt,
    playerCount: data.playerCount,
  })
  if (!checked.ok) return fail(checked.code, checked.message)
  const { sport, price } = checked

  // --- payment choice: refuse what cannot be honoured BEFORE holding the slot --
  const choice = data.payment
  const provider = onlineProvider(onlinePaymentMode())
  if (choice !== 'cash' && !provider) {
    return fail('payment_unavailable', 'Online payment is not available yet. Please choose to pay at the venue.')
  }
  if (choice === 'split' && !canSplit(data.playerCount)) {
    return fail('invalid_input', 'Splitting the payment is available for up to 4 players.')
  }

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

  if (error) {
    // Three no-shows suspend a member for 30 days: say until when.
    if (error.message?.includes('account_suspended') && profileId) {
      const { data: suspended } = await admin.from('profiles').select('suspended_until').eq('id', profileId).maybeSingle()
      const until = suspended?.suspended_until ? formatVenueDate(venueDateString(new Date(suspended.suspended_until))) : null
      return fail(
        'account_suspended',
        `Your account is suspended from booking${until ? ` until ${until}` : ''} because of repeated no-shows. Please contact the club if you think this is a mistake.`
      )
    }
    return mapDatabaseError(error)
  }

  const row = booked as {
    booking_id: string
    reference: string
    starts_at: string
    ends_at: string
    amount: number
    cancel_token: string | null
    /** Always set: a member's read-only pass token, or the guest's own token. */
    pass_token: string | null
  }

  // --- take the payment. The booking exists (and holds the slot) as pending. ----
  let status: 'confirmed' | 'pending_payment' = 'pending_payment'
  let paidNow = 0
  let invites: { shareNo: number; amount: number; path: string }[] = []

  if (choice !== 'cash' && provider) {
    const paid =
      choice === 'online_full'
        ? await admin.rpc('settle_booking_online', { p_booking_id: row.booking_id, p_provider: provider })
        : await admin.rpc('create_booking_shares', {
            p_booking_id: row.booking_id,
            p_provider: provider,
            p_share_count: data.playerCount,
          })

    if (paid.error) {
      // Do not leave a held, unpaid slot behind a failed payment: release it.
      console.error('payment step failed', { code: paid.error.code, message: paid.error.message })
      reportServerError('booking.payment', new Error(`payment step failed: ${paid.error.code ?? 'unknown'}`), { code: paid.error.code ?? null, choice })
      await admin
        .from('bookings')
        .update({ status: 'cancelled', cancellation_reason: 'Payment could not be completed' })
        .eq('id', row.booking_id)
      return fail('payment_failed', 'The payment could not be completed, so the slot was released. Please try again.')
    }

    if (choice === 'online_full') {
      status = 'confirmed'
      paidNow = Number(row.amount)
    } else {
      const split = paid.data as { organizer_amount: number; invites: { share_no: number; amount: number; token: string }[] }
      paidNow = Number(split.organizer_amount)
      invites = split.invites.map((i) => ({ shareNo: i.share_no, amount: Number(i.amount), path: shareInvitePath(i.token) }))
    }
  }

  captureBooking('booking.created', {
    booking_id: row.booking_id,
    org_id: data.orgId,
    court_id: data.courtId,
    sport,
    status,
    time_slot: timeSlotLabel(row.starts_at, row.ends_at),
    date: data.date,
    amount: Number(row.amount),
    price: Number(row.amount),
    payment: choice,
    actor: data.mode,
    source: 'online',
  })

  // Emails go out after the response: the player never waits for the provider, and a
  // failed email cannot undo a booking. notifyBookingCreated() never throws.
  const origin = await appOrigin()
  const inviteAddresses = (data.inviteEmails ?? []).map((e) => e || null)
  const guestEmail = data.mode === 'guest' ? data.guest.email : undefined
  after(async () => {
    await notifyBookingCreated({
      bookingId: row.booking_id,
      origin,
      guestToken: row.cancel_token,
      passToken: row.pass_token,
      guestEmail,
      paidNow,
      invites: invites.map((invite, i) => ({ ...invite, email: inviteAddresses[i] ?? null })),
    })
  })

  return {
    ok: true,
    bookingId: row.booking_id,
    reference: row.reference,
    amount: Number(row.amount),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    cancelPath: row.cancel_token ? guestCancelPath(row.cancel_token) : null,
    status,
    payment: choice,
    paidNow,
    invites,
    passPath: row.pass_token ? `/reservations/${row.booking_id}?token=${row.pass_token}` : `/reservations/${row.booking_id}`,
    emailsEnabled: emailEnabled(),
  }
}
