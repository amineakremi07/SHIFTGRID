'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireOrgAction } from '@/lib/org-access'
import { hashShareToken, resolveViewer } from '@/lib/pass'
import { onlinePaymentMode, onlineProvider, shareInvitePath, SHARE_TOKEN_PATTERN } from '@/lib/payments'
import { GUEST_TOKEN_PATTERN } from '@/lib/guest-cancel'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { actionRateLimit } from '@/lib/rate-limit'

export type PaymentActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string }

function mapPaymentError(message: string | undefined): string {
  const m = message ?? ''
  if (m.includes('invalid_invite')) return 'This payment link is not valid.'
  if (m.includes('already_paid')) return 'This share has already been paid.'
  if (m.includes('booking_not_payable')) return 'This booking is no longer open for payment (it may have been cancelled).'
  if (m.includes('nothing_to_pay')) return 'There is nothing left to collect on this booking.'
  console.error('payment action failed', m)
  return 'Something went wrong. Please try again.'
}

/* ---------------------------------------------------------------------------
   A friend pays their share through the invite link. The token is the only proof
   (like a guest cancel link); the sandbox provider is refused in production.
   ------------------------------------------------------------------------ */

const payShareSchema = z.object({
  token: z.string().regex(SHARE_TOKEN_PATTERN),
  payerName: z.string().trim().max(100).optional(),
})

export async function payShareAction(
  input: z.input<typeof payShareSchema>
): Promise<PaymentActionResult<{ amount: number; confirmed: boolean }>> {
  const limited = await actionRateLimit('booking')
  if (limited) return { ok: false, message: limited }

  const parsed = payShareSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'This payment link is not valid.' }

  const provider = onlineProvider(onlinePaymentMode())
  if (!provider) return { ok: false, message: 'Online payment is not available yet. Please pay the organizer or the club.' }

  const { data, error } = await getSupabaseAdmin().rpc('pay_booking_share', {
    p_token_hash: hashShareToken(parsed.data.token),
    p_provider: provider,
    p_payer_name: parsed.data.payerName,
  })
  if (error) return { ok: false, message: mapPaymentError(error.message) }

  const row = data as { amount: number; confirmed: boolean }
  revalidatePath('/reservations')
  revalidatePath('/dashboard/org/bookings')
  return { ok: true, amount: Number(row.amount), confirmed: row.confirmed }
}

/* ---------------------------------------------------------------------------
   Staff collect the cash at the venue: payment -> paid, booking -> confirmed.
   ------------------------------------------------------------------------ */

export async function markCashPaidAction(bookingId: string): Promise<PaymentActionResult> {
  if (!z.string().uuid().safeParse(bookingId).success) return { ok: false, message: 'Invalid booking.' }

  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return { ok: false, message: auth.message }

  // The RPC also filters on the caller's org, so another club's booking id finds nothing.
  const { error } = await getSupabaseAdmin().rpc('mark_cash_paid', {
    p_booking_id: bookingId,
    p_org_id: auth.ctx.orgId,
  })
  if (error) return { ok: false, message: mapPaymentError(error.message) }

  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/dashboard/org/analytics')
  revalidatePath('/reservations')
  return { ok: true }
}

/* ---------------------------------------------------------------------------
   The organizer lost an invite link (only its hash is stored, so it cannot be
   shown again): mint a new one for a still-pending share. The old link stops working.
   ------------------------------------------------------------------------ */

const regenerateSchema = z.object({
  bookingId: z.string().uuid(),
  shareNo: z.number().int().min(2).max(4),
  guestToken: z.string().regex(GUEST_TOKEN_PATTERN).optional(),
})

export async function regenerateShareInviteAction(
  input: z.input<typeof regenerateSchema>
): Promise<PaymentActionResult<{ path: string }>> {
  const parsed = regenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Invalid request.' }
  const { bookingId, shareNo, guestToken } = parsed.data

  const access = await resolveViewer(bookingId, guestToken)
  // Only the person who booked (or holds the guest link) manages invites; club staff do not.
  if (!access || access.viewer === 'staff') return { ok: false, message: 'You cannot change this booking.' }

  const token = randomBytes(24).toString('hex')
  const { data, error } = await getSupabaseAdmin()
    .from('booking_shares')
    .update({ invite_token_hash: hashShareToken(token) })
    .eq('booking_id', bookingId)
    .eq('share_no', shareNo)
    .eq('status', 'pending')
    .eq('is_organizer', false)
    .select('id')
  if (error || !data?.length) return { ok: false, message: 'That share is already paid or does not exist.' }

  revalidatePath(`/reservations/${bookingId}`)
  return { ok: true, path: shareInvitePath(token) }
}
