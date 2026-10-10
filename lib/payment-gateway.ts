import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { onlinePaymentMode, type OnlineMode } from '@/lib/payments'

/**
 * Foundation for online card payment. A real gateway (ClickToPay, Konnect, Flouci, Stripe) plugs in by
 * implementing `PaymentGateway`; until then only the SANDBOX gateway exists, and it is available only when
 * `onlinePaymentMode()` is 'test' (dev, or PAYMENTS_TEST_MODE=1). Pure apart from the HMAC: unit-testable.
 *
 * Flow: the booking is created `pending_payment` (it holds the slot) -> `createCheckoutSession` -> the player
 * pays on the gateway's page -> the gateway calls POST /api/v1/payments/webhook with a signed event ->
 * the webhook confirms (`payment.succeeded`) or releases the slot (`payment.failed` / `payment.expired`).
 */
export const CURRENCY = 'TND' as const

export type CheckoutSession = {
  id: string
  provider: string
  bookingId: string
  amount: number
  currency: typeof CURRENCY
  /** Where to send the player; null for the sandbox, which has no hosted page. */
  checkoutUrl: string | null
}

export interface PaymentGateway {
  readonly name: string
  createCheckoutSession(input: { bookingId: string; amount: number; returnUrl: string }): Promise<CheckoutSession>
  /** The raw body is what the signature covers; never re-serialise it before verifying. */
  verifyWebhook(rawBody: string, signature: string | null): PaymentEvent | null
}

export const paymentEventSchema = z
  .object({
    /** The gateway's own event id, for idempotent processing and logs. */
    id: z.string().trim().min(1).max(100),
    type: z.enum(['payment.succeeded', 'payment.failed', 'payment.expired']),
    booking_id: z.string().uuid(),
  })
  .strict()
export type PaymentEvent = z.infer<typeof paymentEventSchema>

/** Hex HMAC-SHA256 of the raw body. */
export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function signatureMatches(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false
  const expected = Buffer.from(signPayload(rawBody, secret), 'hex')
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Fixed development secret for the sandbox; never used in production. */
export const SANDBOX_DEV_SECRET = 'sandbox-webhook-secret'

export function webhookSecret(mode: OnlineMode = onlinePaymentMode(), env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.PAYMENT_WEBHOOK_SECRET
  if (configured && configured.length >= 16) return configured
  return mode === 'test' && env.NODE_ENV !== 'production' ? SANDBOX_DEV_SECRET : null
}

export function sandboxGateway(secret: string): PaymentGateway {
  return {
    name: 'test',
    async createCheckoutSession({ bookingId, amount }) {
      return { id: `sbx_${bookingId}`, provider: 'test', bookingId, amount, currency: CURRENCY, checkoutUrl: null }
    },
    verifyWebhook(rawBody, signature) {
      if (!signatureMatches(rawBody, signature, secret)) return null
      try {
        const parsed = paymentEventSchema.safeParse(JSON.parse(rawBody))
        return parsed.success ? parsed.data : null
      } catch {
        return null
      }
    },
  }
}

/** The gateway for the current mode, or null when none is configured (production without a real provider). */
export function activeGateway(mode: OnlineMode = onlinePaymentMode()): PaymentGateway | null {
  if (mode !== 'test') return null // a real provider is added here
  const secret = webhookSecret(mode)
  return secret ? sandboxGateway(secret) : null
}
