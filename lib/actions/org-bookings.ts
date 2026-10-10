'use server'

import { revalidatePath } from 'next/cache'

import { actionFail, actionOk, type ActionResult } from '@/lib/actions/result'
import { markNoShow } from '@/lib/check-in'
import { requireOrgAction } from '@/lib/org-access'

// Bookings made by staff go through POST /api/v1/bookings/manual (lib/manual-booking.ts).

export type NoShowResult = ActionResult<{ message: string }>

/**
 * Mark a booking nobody turned up for. A member loses 30 trust points and gains a
 * no-show (the 3rd suspends them for 30 days); a guest has no account, so only the
 * booking is marked. The club comes from the caller's session, never from input.
 */
export async function markNoShowAction(bookingId: string): Promise<NoShowResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
    return actionFail('Invalid booking.')
  }
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return actionFail(auth.message)

  const result = await markNoShow(auth.ctx.orgId, bookingId)
  if (!result.ok) return actionFail(result.message)

  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/dashboard/org/analytics')
  revalidatePath('/reservations')

  if (!result.isMember) return actionOk({ message: 'Marked as a no-show.' })
  const base = `Marked as a no-show. Trust score is now ${result.trustScore}, with ${result.noShowCount} no-show${result.noShowCount === 1 ? '' : 's'}.`
  return actionOk({ message: result.suspendedUntil ? `${base} The player is suspended from booking for 30 days.` : base })
}
