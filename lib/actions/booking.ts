'use server'

import { createHash } from 'node:crypto'

import { after } from 'next/server'

import { getSessionProfile } from '@/lib/org-access'
import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { assessBookingRisk } from '@/lib/risk-loader'
import { captureAudit, captureBooking, captureRateLimit, captureServerEvent, timed } from '@/lib/telemetry'
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
  | 'too_many_pending'
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
      /** The booker's history makes a no-show likely: the screen shows a deposit warning. Never blocks the booking. */
      highRisk?: boolean
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
    return fail('slot_taken', 'Ce créneau vient d\'être réservé par un autre joueur. Veuillez choisir un autre horaire.')
  }
  const message = error.message ?? ''
  if (message.includes('too_many_pending')) {
    return fail('too_many_pending', 'Vous avez déjà 2 réservations impayées dans ce club. Veuillez en payer ou en annuler une avant de réserver à nouveau.')
  }
  if (message.includes('slot_in_past')) {
    return fail('slot_in_past', 'Cet horaire est déjà passé. Veuillez choisir un autre créneau.')
  }
  if (message.includes('not_a_member')) {
    return fail('not_a_member', 'Votre compte n\'est pas membre de ce club. Vous pouvez réserver en tant qu\'invité.')
  }
  if (message.includes('invalid_court')) {
    return fail('unavailable', 'Ce terrain n\'est plus disponible à la réservation.')
  }
  if (error.code === '23514') {
    return fail('invalid_input', 'Ce nombre de joueurs n\'est pas autorisé pour ce sport.')
  }
  console.error('create_booking failed', { code: error.code, message })
  reportServerError('booking.create', new Error(`create_booking failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
  return fail('unknown', 'Une erreur est survenue lors de la réservation. Veuillez réessayer.')
}

/**
 * Release a slot held for a booking whose payment step failed. The booking is cancelled (the existing trigger
 * frees the slot lock). A failed or empty update is retried, and the real state is read back, so a held slot is
 * never silently left behind:
 *   'released'  the booking is cancelled
 *   'confirmed' it turned out to be paid after all (the payment call committed but its answer was lost): left alone
 *   'failed'    still held after every attempt: the caller logs it and tells the player
 */
async function releaseHeldSlot(admin: ReturnType<typeof getSupabaseAdmin>, bookingId: string): Promise<'released' | 'confirmed' | 'failed'> {
  const waits = [0, 150, 500]
  for (const wait of waits) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    const { data, error } = await admin
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: 'Payment could not be completed' })
      .eq('id', bookingId)
      .eq('status', 'pending_payment')
      .select('id')
    if (error) {
      console.error('releaseHeldSlot: update failed', { bookingId, code: error.code, message: error.message })
      continue
    }
    if (data?.length) return 'released'
    // No row changed: someone else already moved it. Read what it is now.
    const { data: now } = await admin.from('bookings').select('status').eq('id', bookingId).maybeSingle()
    if (now?.status === 'cancelled') return 'released'
    if (now?.status === 'confirmed' || now?.status === 'completed') return 'confirmed'
  }
  return 'failed'
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
      message: 'Veuillez vérifier vos informations et réessayer.',
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

  const admin = getSupabaseAdmin()
  const isMember = data.mode === 'member'
  const guestPhone = data.mode === 'guest' ? data.guest.phone : undefined

  // Everything below is independent, so it runs together instead of one round trip after another:
  //  - who is booking (members only: ONE getUser + profile read, shared with the rest of the request),
  //  - the court / hours / price check,
  //  - the slot-hogging limits: guests are counted twice (this phone from this IP, and the IP as a whole, looser,
  //    as the backstop for someone who keeps changing the number; a bucket on phone + IP alone is dodged by
  //    rotating numbers, one on the IP alone locks out everyone sharing a mobile-carrier address); members are
  //    counted per account, which needs the account id, so that one starts the moment the session is known,
  //  - the no-show risk score: advisory (it only warns, it never refuses) and it never throws, so it starts as
  //    soon as the booker is known and is only awaited once the booking exists.
  const guestPhoneKey = guestPhone ? createHash('sha256').update(guestPhone).digest('hex').slice(0, 16) : undefined
  const sessionP = isMember ? getSessionProfile() : Promise.resolve(null)
  const checkedP = checkBookableSlot(admin, {
    orgId: data.orgId,
    courtId: data.courtId,
    date: data.date,
    startsAt: data.startsAt,
    playerCount: data.playerCount,
  })
  const guestLimitedP = isMember
    ? Promise.resolve(null)
    : actionRateLimit('guest_ip').then((hit) => hit ?? actionRateLimit('booking', undefined, guestPhoneKey))
  const memberLimitedP = sessionP.then((session) => (isMember ? actionRateLimit('booking', session?.user?.id) : null))
  const riskP = sessionP.then((session) =>
    isMember && !session?.user
      ? null
      : assessBookingRisk({ profileId: session?.user?.id, guestPhone, startsAt: data.startsAt })
  )

  const [session, checked, guestLimited, memberLimited] = await Promise.all([sessionP, checkedP, guestLimitedP, memberLimitedP])

  // Decisions, in the order a caller should hear about them.
  const limited = guestLimited ?? memberLimited
  if (limited) return fail('rate_limited', limited)
  if (!checked.ok) return fail(checked.code, checked.message)
  const { sport, price } = checked

  // --- payment choice: refuse what cannot be honoured BEFORE holding the slot --
  const choice = data.payment
  const provider = onlineProvider(onlinePaymentMode())
  if (choice !== 'cash' && !provider) {
    return fail('payment_unavailable', 'Le paiement en ligne n\'est pas encore disponible. Veuillez choisir de payer sur place.')
  }
  if (choice === 'split' && !canSplit(data.playerCount)) {
    return fail('invalid_input', 'Le paiement partagé est disponible jusqu\'à 4 joueurs.')
  }

  // --- who is booking --------------------------------------------------------
  let profileId: string | undefined
  if (isMember) {
    if (!session?.user) return fail('not_signed_in', 'Connectez-vous pour réserver en tant que membre, ou continuez en tant qu\'invité.')
    profileId = session.user.id
  }

  // Anti no-show: it only warns (and is counted in analytics), it never refuses. Already running; usually done.
  const risk = (await riskP) ?? { score: 0, level: 'low' as const, reasons: [] as string[] }

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
        `Votre compte est suspendu des réservations${until ? ` jusqu\'au ${until}` : ''} en raison d\'absences répétées. Veuillez contacter le club si vous pensez qu\'il s\'agit d\'une erreur.`
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
      // Do not leave a held, unpaid slot behind a failed payment: release it, and make sure it really happened.
      console.error('payment step failed', { code: paid.error.code, message: paid.error.message })
      reportServerError('booking.payment', new Error(`payment step failed: ${paid.error.code ?? 'unknown'}`), { code: paid.error.code ?? null, choice })
      const released = await releaseHeldSlot(admin, row.booking_id)
      if (released === 'released') {
        return fail('payment_failed', 'Le paiement n\'a pas pu être finalisé, le créneau a donc été libéré. Veuillez réessayer.')
      }
      captureAudit({ action: 'booking.release_failed', status: released, booking_id: row.booking_id, org_id: data.orgId, actor: data.mode })
      reportServerError('booking.release', new Error(`held slot not released after payment failure: ${released}`), { booking_id: row.booking_id, state: released })
      return fail(
        'payment_failed',
        released === 'confirmed'
          ? `Impossible de confirmer l\'état du paiement de la réservation ${row.reference}. Consultez Mes réservations, ou contactez le club, avant de payer à nouveau.`
          : `Le paiement n\'a pas pu être finalisé et le créneau n\'a pas pu être libéré automatiquement (référence ${row.reference}). Veuillez contacter le club ou réessayer dans quelques minutes.`
      )
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

  if (risk.level === 'high') {
    // Ids, a score and short reasons only: no name, phone or email.
    captureServerEvent('booking.high_risk_flagged', {
      booking_id: row.booking_id,
      org_id: data.orgId,
      risk_score: risk.score,
      risk_level: risk.level,
      reasons: risk.reasons.join(' | '),
      payment: choice,
      actor: data.mode,
    })
  }

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
    ...(risk.level === 'high' ? { highRisk: true } : {}),
  }
}
