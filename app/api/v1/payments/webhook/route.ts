import { NextRequest, NextResponse } from 'next/server'

import { activeGateway } from '@/lib/payment-gateway'
import { reportServerError } from '@/lib/observability'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * POST /api/v1/payments/webhook
 *
 * Payment gateway callback. Authenticated only by the HMAC signature over the raw body
 * (header `x-signature`), never by a session or API key. Idempotent: replaying an event answers 200.
 *  - payment.succeeded -> settle_booking_online (booking `confirmed`, payment `paid`)
 *  - payment.failed / payment.expired -> the unpaid booking is cancelled, which frees the slot
 * Without a configured gateway (production before a real provider is added) it answers 503.
 */
export const runtime = 'nodejs'

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  const gateway = activeGateway()
  if (!gateway) return json({ success: false, error: 'Online payment is not configured' }, 503)

  const raw = await request.text()
  if (raw.length > 4096) return json({ success: false, error: 'Payload too large' }, 413)

  const event = gateway.verifyWebhook(raw, request.headers.get('x-signature'))
  if (!event) return json({ success: false, error: 'Invalid signature or payload' }, 400)

  const admin = getSupabaseAdmin()
  try {
    if (event.type === 'payment.succeeded') {
      const { error } = await admin.rpc('settle_booking_online', { p_booking_id: event.booking_id, p_provider: gateway.name })
      if (error) {
        if (/booking_not_payable|nothing_to_pay/.test(error.message)) {
          return json({ success: true, status: 'already_processed' }, 200) // replay, or the booking was released first
        }
        throw new Error(`settle failed: ${error.code ?? error.message}`)
      }
      return json({ success: true, status: 'confirmed' }, 200)
    }

    const { data, error } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: event.type === 'payment.expired' ? 'Payment expired' : 'Payment failed',
      })
      .eq('id', event.booking_id)
      .eq('status', 'pending_payment')
      .select('id')
    if (error) throw new Error(`release failed: ${error.code ?? error.message}`)
    return json({ success: true, status: data?.length ? 'cancelled' : 'already_processed' }, 200)
  } catch (error) {
    reportServerError('payments.webhook', error, { type: event.type })
    return json({ success: false, error: 'Could not process the event' }, 500)
  }
}
