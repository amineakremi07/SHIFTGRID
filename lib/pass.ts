import { createHash } from 'node:crypto'

import { GUEST_TOKEN_PATTERN, hashGuestToken } from '@/lib/guest-cancel'
import { SHARE_TOKEN_PATTERN } from '@/lib/payments'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'
import type { BookingStatus, PaymentProvider, PaymentStatus, Sport } from '@/lib/types/database'

/**
 * A booking's pass (`/reservations/[id]`) and the checks around it. Server only.
 *
 * Who may see or act on a booking is decided here, from the verified session or a
 * secret token, never from the URL alone:
 *  - `owner`: the signed-in member who booked it;
 *  - `guest`: whoever holds the booking's secret link (its guest cancel token);
 *  - `pass`: whoever holds a MEMBER booking's pass link (`pass_token_hash`): view only, no cancelling or managing;
 *  - `staff`: owner/staff of the booking's club, or a platform admin.
 * Everyone else gets `null`, which the page turns into a 404.
 */

/** `pass`: holds a member booking's READ-ONLY pass link (the email button): can see the pass, nothing else. */
export type Viewer = 'owner' | 'guest' | 'staff' | 'pass'

export type PassShare = {
  shareNo: number
  amount: number
  status: PaymentStatus
  isOrganizer: boolean
  payerName: string | null
}

export type Pass = {
  id: string
  reference: string
  orgId: string
  clubName: string
  courtName: string
  sport: Sport
  startsAt: string
  endsAt: string
  playerCount: number
  status: BookingStatus
  cancellationReason: string | null
  cancelDeadline: string
  amount: number
  paymentStatus: PaymentStatus | null
  provider: PaymentProvider | null
  shares: PassShare[]
  viewer: Viewer
  /** Present for guests: the secret that proves it, needed to act on the booking. */
  guestToken: string | null
  /** 6-digit arrival code the club asks for at reception. */
  checkInCode: string | null
  checkedInAt: string | null
}

export const hashShareToken = (token: string) => createHash('sha256').update(token).digest('hex')
export { SHARE_TOKEN_PATTERN }

type BookingRow = { id: string; org_id: string; booker_profile_id: string | null; guest_cancel_token_hash: string | null; pass_token_hash: string | null }

/** How the caller relates to a booking, or null when they have no right to it. */
export async function resolveViewer(bookingId: string, guestToken?: string | null): Promise<{ viewer: Viewer; booking: BookingRow } | null> {
  const admin = getSupabaseAdmin()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, org_id, booker_profile_id, guest_cancel_token_hash, pass_token_hash')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return null

  if (guestToken && GUEST_TOKEN_PATTERN.test(guestToken) && booking.guest_cancel_token_hash === hashGuestToken(guestToken)) {
    return { viewer: 'guest', booking }
  }
  if (guestToken && GUEST_TOKEN_PATTERN.test(guestToken) && booking.pass_token_hash && booking.pass_token_hash === hashGuestToken(guestToken)) {
    return { viewer: 'pass', booking }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  if (booking.booker_profile_id === user.id) return { viewer: 'owner', booking }

  const { data: profile } = await supabase.from('profiles').select('role, org_id').eq('id', user.id).maybeSingle()
  if (profile?.role === 'platform_admin') return { viewer: 'staff', booking }
  if ((profile?.role === 'org_admin' || profile?.role === 'staff') && profile.org_id === booking.org_id) {
    return { viewer: 'staff', booking }
  }
  return null
}

export async function loadPass(bookingId: string, guestToken?: string | null): Promise<Pass | null> {
  const access = await resolveViewer(bookingId, guestToken)
  if (!access) return null

  const admin = getSupabaseAdmin()
  const { data: b } = await admin
    .from('bookings')
    .select('id, org_id, court_id, sport, starts_at, ends_at, status, player_count, cancellation_deadline, cancellation_reason, check_in_code, checked_in_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (!b) return null

  const [org, court, payment, shares] = await Promise.all([
    admin.from('organizations').select('name').eq('id', b.org_id).maybeSingle(),
    b.court_id ? admin.from('courts').select('name').eq('id', b.court_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('payment_records').select('amount, status, provider').eq('booking_id', b.id).maybeSingle(),
    admin
      .from('booking_shares')
      .select('share_no, amount, status, is_organizer, payer_name')
      .eq('booking_id', b.id)
      .order('share_no'),
  ])

  return {
    id: b.id,
    reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    orgId: b.org_id,
    clubName: org.data?.name ?? 'the club',
    courtName: court.data?.name ?? 'Court',
    sport: b.sport as Sport,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    playerCount: b.player_count,
    status: b.status,
    cancellationReason: b.cancellation_reason,
    cancelDeadline: b.cancellation_deadline,
    amount: Number(payment.data?.amount ?? 0),
    paymentStatus: payment.data?.status ?? null,
    provider: payment.data?.provider ?? null,
    shares: (shares.data ?? []).map((s) => ({
      shareNo: s.share_no,
      amount: Number(s.amount),
      status: s.status,
      isOrganizer: s.is_organizer,
      payerName: s.payer_name,
    })),
    viewer: access.viewer,
    guestToken: access.viewer === 'guest' ? (guestToken ?? null) : null,
    checkInCode: b.check_in_code,
    checkedInAt: b.checked_in_at,
  }
}

export type ShareInvite = {
  clubName: string
  courtName: string
  sport: Sport
  startsAt: string
  endsAt: string
  bookingStatus: BookingStatus
  shareNo: number
  amount: number
  shareStatus: PaymentStatus
  /** How many of the shares are paid, e.g. 2 of 4. */
  paidCount: number
  totalShares: number
}

/** The share an invite token belongs to, or null (malformed, unknown or wrong alike). */
export async function findShareInvite(token: string | undefined | null): Promise<ShareInvite | null> {
  if (!token || !SHARE_TOKEN_PATTERN.test(token)) return null
  const admin = getSupabaseAdmin()
  const { data: share } = await admin
    .from('booking_shares')
    .select('booking_id, share_no, amount, status')
    .eq('invite_token_hash', hashShareToken(token))
    .maybeSingle()
  if (!share) return null

  const { data: b } = await admin
    .from('bookings')
    .select('org_id, court_id, sport, starts_at, ends_at, status')
    .eq('id', share.booking_id)
    .maybeSingle()
  if (!b) return null

  const [org, court, all] = await Promise.all([
    admin.from('organizations').select('name').eq('id', b.org_id).maybeSingle(),
    b.court_id ? admin.from('courts').select('name').eq('id', b.court_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('booking_shares').select('status').eq('booking_id', share.booking_id),
  ])
  const statuses = all.data ?? []
  return {
    clubName: org.data?.name ?? 'the club',
    courtName: court.data?.name ?? 'Court',
    sport: b.sport as Sport,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    bookingStatus: b.status,
    shareNo: share.share_no,
    amount: Number(share.amount),
    shareStatus: share.status,
    paidCount: statuses.filter((s) => s.status === 'paid').length,
    totalShares: statuses.length,
  }
}
