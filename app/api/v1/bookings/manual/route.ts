import { NextRequest, NextResponse } from 'next/server'

import { apiFail, readJsonObject, resolveApiOrg } from '@/lib/api-org-auth'
import { createManualBooking } from '@/lib/manual-booking'
import { reportServerError } from '@/lib/observability'

/**
 * POST /api/v1/bookings/manual
 * A staff-made booking for a customer at the desk or on the phone.
 *
 * Body (JSON):
 *   court_id        uuid of one of the club's courts          (required)
 *   date            venue day, YYYY-MM-DD                      (required)
 *   starts_at       ISO instant of the slot start   } exactly one of these two; the slot must
 *   start_time      "HH:MM" on `date` (venue time)  } be on the court's grid, its length is fixed by the sport
 *   full_name       customer name                              (required)
 *   payment_status  "paid_on_site" | "pay_at_venue"            (required)
 *   phone, email, notes, player_count, source ("manual" | "phone")   (optional)
 *
 * Auth: the dashboard session of an owner or staff member of an approved club, or an API key
 * with 'write'. The club is always the caller's own. Answers 201 with the booking and its
 * check-in code; 409 "Slot already booked" when the slot is taken (atomic, race-safe).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const org = await resolveApiOrg(request)
    if (org instanceof NextResponse) return org

    const body = await readJsonObject(request)
    if (!body) return apiFail('Request body must be a JSON object', 400, 'invalid_input')

    const result = await createManualBooking(org.orgId, body)
    if (!result.ok) {
      return apiFail(result.message, result.status, result.code, result.fieldErrors ? { fieldErrors: result.fieldErrors } : {})
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          booking_id: result.bookingId,
          reference: result.reference,
          court_id: result.courtId,
          court: result.courtName,
          starts_at: result.startsAt,
          ends_at: result.endsAt,
          status: result.status,
          payment_status: result.paymentStatus,
          amount: result.amount,
          check_in_code: result.checkInCode,
          email_queued: result.emailQueued,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Manual booking error:', error instanceof Error ? error.message : error)
    reportServerError('api.v1.bookings.manual', error)
    return apiFail('An unexpected error occurred', 500)
  }
}
