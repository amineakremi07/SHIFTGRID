import { parseCheckInInput } from '@/lib/check-in-input'
import { reportServerError } from '@/lib/observability'
import { captureAudit, timed } from '@/lib/telemetry'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Club-side arrival handling: check a player in, or mark a no-show. Server only, and
 * always scoped to ONE club (`orgId`) that the caller got from a verified session or a
 * verified API key, never from the request body. The database functions do the real
 * work atomically (row lock + status guard), so two receptionists scanning the same
 * pass cannot both succeed and a no-show cannot be applied twice.
 */

export type CheckInFailure = {
  ok: false
  /** HTTP status the API route answers with. */
  status: 400 | 404 | 409 | 422 | 500
  code:
    | 'invalid_input'
    | 'booking_not_found'
    | 'already_checked_in'
    | 'booking_cancelled'
    | 'booking_no_show'
    | 'ambiguous_code'
    | 'too_early'
    | 'too_late'
    | 'already_no_show'
    | 'unknown'
  message: string
}

export type CheckInSuccess = {
  ok: true
  bookingId: string
  reference: string
  courtName: string
  startsAt: string
  endsAt: string
  checkedInAt: string
  bookerName: string
  isMember: boolean
  /** Cash the club still has to collect (0 when settled). */
  cashDue: number
  /** True when the booking is not fully paid and it is not simple cash (e.g. unpaid split shares). */
  paymentPending: boolean
}

const MESSAGES: Record<Exclude<CheckInFailure['code'], 'unknown'>, { status: CheckInFailure['status']; message: string }> = {
  invalid_input: { status: 400, message: 'Saisissez le code d\'arrivée à 6 chiffres, la référence de la réservation ou scannez le QR code.' },
  booking_not_found: { status: 404, message: 'Aucune réservation ouverte ne correspond à ce code dans votre club.' },
  already_checked_in: { status: 409, message: 'L\'arrivée est déjà enregistrée pour cette réservation.' },
  booking_cancelled: { status: 409, message: 'Cette réservation a été annulée.' },
  booking_no_show: { status: 409, message: 'Cette réservation a déjà été marquée comme absence.' },
  ambiguous_code: { status: 409, message: 'Deux réservations partagent ce code. Utilisez plutôt la référence de la réservation.' },
  too_early: { status: 422, message: 'Trop tôt : l\'enregistrement ouvre 60 minutes avant le créneau.' },
  too_late: { status: 422, message: 'Ce créneau est terminé : l\'arrivée ne peut plus être enregistrée. Vous pouvez le marquer comme absence.' },
  already_no_show: { status: 409, message: 'Cette réservation a déjà été marquée comme absence.' },
}

function mapError(area: string, error: { code?: string; message?: string }): CheckInFailure {
  const text = error.message ?? ''
  for (const [code, info] of Object.entries(MESSAGES)) {
    if (text.includes(code)) return { ok: false, code: code as CheckInFailure['code'], ...info }
  }
  console.error(`${area} failed`, { code: error.code, message: text })
  reportServerError(area, new Error(`${area} failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
  return { ok: false, status: 500, code: 'unknown', message: 'Une erreur est survenue. Veuillez réessayer.' }
}

/** Find a booking of this club by its 8-character reference (the first 8 hex of its id). */
async function bookingIdByReference(orgId: string, reference: string): Promise<string | null | 'ambiguous'> {
  const prefix = reference.toLowerCase()
  const { data } = await getSupabaseAdmin()
    .from('bookings')
    .select('id')
    .eq('org_id', orgId)
    .gte('id', `${prefix}-0000-0000-0000-000000000000`)
    .lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`)
    .limit(2)
  if (!data || data.length === 0) return null
  return data.length > 1 ? 'ambiguous' : data[0].id
}

export async function checkInBooking(...args: Parameters<typeof checkInBookingImpl>): ReturnType<typeof checkInBookingImpl> {
  return timed('api.booking.check_in', () => checkInBookingImpl(...args))
}

async function checkInBookingImpl(orgId: string, rawInput: string): Promise<CheckInSuccess | CheckInFailure> {
  const key = parseCheckInInput(rawInput)
  if (!key) return { ok: false, code: 'invalid_input', ...MESSAGES.invalid_input }

  const admin = getSupabaseAdmin()
  let bookingId: string | undefined
  if (key.kind === 'id') bookingId = key.bookingId
  if (key.kind === 'reference') {
    const found = await bookingIdByReference(orgId, key.reference)
    if (found === 'ambiguous') return { ok: false, code: 'ambiguous_code', ...MESSAGES.ambiguous_code }
    if (!found) return { ok: false, code: 'booking_not_found', ...MESSAGES.booking_not_found }
    bookingId = found
  }

  const { data, error } = await admin.rpc('check_in_booking', {
    p_org_id: orgId,
    p_code: key.kind === 'code' ? key.code : undefined,
    p_booking_id: bookingId,
  })
  if (error) return mapError('checkin.rpc', error)

  const row = data as {
    booking_id: string
    reference: string
    court_id: string | null
    starts_at: string
    ends_at: string
    checked_in_at: string
    booker_profile_id: string | null
    booker_anon_id: string | null
    payment_status: 'pending' | 'paid' | 'refunded' | null
    payment_provider: string | null
    amount: number | null
  }

  const [court, member, guest] = await Promise.all([
    row.court_id ? admin.from('courts').select('name').eq('id', row.court_id).maybeSingle() : Promise.resolve({ data: null }),
    row.booker_profile_id ? admin.from('profiles').select('display_name').eq('id', row.booker_profile_id).maybeSingle() : Promise.resolve({ data: null }),
    row.booker_anon_id ? admin.from('anonymous_bookers').select('name').eq('id', row.booker_anon_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  captureAudit({ action: 'booking.check_in', status: 'completed', booking_id: row.booking_id, org_id: orgId, actor: 'staff' })
  const unpaid = row.payment_status === 'pending'
  return {
    ok: true,
    bookingId: row.booking_id,
    reference: row.reference,
    courtName: court.data?.name ?? 'Terrain',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    checkedInAt: row.checked_in_at,
    bookerName: member.data?.display_name ?? guest.data?.name ?? 'Joueur',
    isMember: Boolean(row.booker_profile_id),
    cashDue: unpaid && row.payment_provider === 'cash' ? Number(row.amount ?? 0) : 0,
    paymentPending: unpaid && row.payment_provider !== 'cash',
  }
}

export type NoShowSuccess = {
  ok: true
  isMember: boolean
  noShowCount: number | null
  trustScore: number | null
  suspendedUntil: string | null
}

export async function markNoShow(...args: Parameters<typeof markNoShowImpl>): ReturnType<typeof markNoShowImpl> {
  return timed('action.booking.no_show', () => markNoShowImpl(...args))
}

async function markNoShowImpl(orgId: string, bookingId: string): Promise<NoShowSuccess | CheckInFailure> {
  const { data, error } = await getSupabaseAdmin().rpc('mark_booking_no_show', { p_org_id: orgId, p_booking_id: bookingId })
  if (error) {
    if (error.message?.includes('too_early')) {
      return { ok: false, status: 422, code: 'too_early', message: 'Une absence peut être enregistrée 15 minutes après le début du créneau.' }
    }
    return mapError('noshow.rpc', error)
  }
  const row = data as {
    is_member: boolean
    no_show_count: number | null
    trust_score: number | null
    is_suspended: boolean | null
    suspended_until: string | null
  }
  captureAudit({
    action: 'booking.no_show',
    status: row.is_suspended ? 'no_show_member_suspended' : 'no_show',
    booking_id: bookingId,
    org_id: orgId,
    actor: 'staff',
  })
  return {
    ok: true,
    isMember: row.is_member,
    noShowCount: row.no_show_count,
    trustScore: row.trust_score,
    suspendedUntil: row.is_suspended ? row.suspended_until : null,
  }
}
