import { createHash } from 'node:crypto'

import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import type { BookingStatus, Sport } from '@/lib/types/database'

/**
 * Guest self-service cancellation.
 *
 * A guest has no account, so the secret link is their proof of ownership:
 * `create_booking()` mints a random 192-bit token (48 hex chars) and stores only
 * its SHA-256. This module hashes a presented token and finds the booking.
 * Server only (it uses the service-role client).
 */

export const GUEST_TOKEN_PATTERN = /^[0-9a-f]{48}$/

export const hashGuestToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Site-relative link a guest keeps. The client prefixes its own origin. */
export const guestCancelPath = (token: string) => `/reservations/cancel-guest?token=${token}`

export type GuestBooking = {
  id: string
  orgId: string
  clubName: string
  courtName: string
  sport: Sport
  startsAt: string
  endsAt: string
  status: BookingStatus
  reference: string
  cancelDeadline: string
  guestName: string | null
}

/** The booking a token belongs to, or null (malformed, unknown, or wrong token alike). */
export async function findGuestBooking(token: string | undefined | null): Promise<GuestBooking | null> {
  if (!token || !GUEST_TOKEN_PATTERN.test(token)) return null

  const admin = getSupabaseAdmin()
  const { data: b } = await admin
    .from('bookings')
    .select('id, org_id, court_id, sport, starts_at, ends_at, status, cancellation_deadline, booker_anon_id')
    .eq('guest_cancel_token_hash', hashGuestToken(token))
    .maybeSingle()
  if (!b) return null

  const [org, court, guest] = await Promise.all([
    admin.from('organizations').select('name').eq('id', b.org_id).maybeSingle(),
    b.court_id ? admin.from('courts').select('name').eq('id', b.court_id).maybeSingle() : Promise.resolve({ data: null }),
    b.booker_anon_id
      ? admin.from('anonymous_bookers').select('name').eq('id', b.booker_anon_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: b.id,
    orgId: b.org_id,
    clubName: org.data?.name ?? 'the club',
    courtName: court.data?.name ?? 'Court',
    sport: b.sport as Sport,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    status: b.status,
    reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    cancelDeadline: b.cancellation_deadline,
    guestName: guest.data?.name ?? null,
  }
}
