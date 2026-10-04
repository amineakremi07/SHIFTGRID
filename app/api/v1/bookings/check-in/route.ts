import { NextRequest, NextResponse } from 'next/server'

import { checkInBooking } from '@/lib/check-in'
import { apiFail as fail, readJsonObject, resolveApiOrg } from '@/lib/api-org-auth'
import { reportServerError } from '@/lib/observability'

/**
 * POST /api/v1/bookings/check-in
 * Body (JSON): { "check_in_code": "782910" }  or  { "booking_id": "<uuid>" }
 *              or { "reference": "3922DD5F" }  (a scanned QR payload also works in any of them)
 *
 * Marks the booking `completed` with `checked_in_at = now()`. Two ways in:
 *  - an API key (`Authorization: Bearer sg_live_...`) with the 'write' permission, for kiosks
 *    or access-control hardware; the club is the key's club;
 *  - the club dashboard session (owner or staff of an approved club); the club is the
 *    caller's own, taken from their profile.
 * The club NEVER comes from the body, so one club cannot check in another's bookings.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const org = await resolveApiOrg(request)
    if (org instanceof NextResponse) return org

    const body = await readJsonObject(request)
    if (!body) return fail('Request body must be a JSON object', 400)

    const raw = [body.check_in_code, body.booking_id, body.reference, body.code].find(
      (v): v is string | number => typeof v === 'string' || typeof v === 'number'
    )
    if (raw === undefined) return fail('Provide check_in_code, booking_id or reference', 400, 'invalid_input')

    const result = await checkInBooking(org.orgId, String(raw))
    if (!result.ok) return fail(result.message, result.status, result.code)

    return NextResponse.json({
      success: true,
      data: {
        booking_id: result.bookingId,
        reference: result.reference,
        status: 'completed',
        checked_in_at: result.checkedInAt,
        court: result.courtName,
        starts_at: result.startsAt,
        ends_at: result.endsAt,
        booker: result.bookerName,
        is_member: result.isMember,
        cash_due: result.cashDue,
        payment_pending: result.paymentPending,
      },
    })
  } catch (error) {
    console.error('Check-in error:', error instanceof Error ? error.message : error)
    reportServerError('api.v1.bookings.check-in', error)
    return fail('An unexpected error occurred', 500)
  }
}
