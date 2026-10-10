import { expect, test } from '@playwright/test'

import { activeGateway, sandboxGateway, signPayload, webhookSecret } from '../lib/payment-gateway'
import { isReminderDue, reminderWhatsappLink, reminderWhatsappMessage } from '../lib/whatsapp'

const BOOKING = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
const SECRET = 'a-test-secret-of-16+chars'
const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', booking_id: BOOKING })

test.describe('payment gateway foundation', () => {
  const gw = sandboxGateway(SECRET)

  test('accepts a correctly signed event and rejects tampering', () => {
    expect(gw.verifyWebhook(body, signPayload(body, SECRET))?.booking_id).toBe(BOOKING)
    expect(gw.verifyWebhook(body + ' ', signPayload(body, SECRET))).toBeNull()
    expect(gw.verifyWebhook(body, signPayload(body, 'another-secret-16chars'))).toBeNull()
    expect(gw.verifyWebhook(body, null)).toBeNull()
    expect(gw.verifyWebhook(body, 'zz')).toBeNull()
  })

  test('rejects unknown event types and extra fields even when signed', () => {
    for (const bad of [
      { id: 'e', type: 'payment.refunded', booking_id: BOOKING },
      { id: 'e', type: 'payment.failed', booking_id: BOOKING, amount: 1 },
    ]) {
      const raw = JSON.stringify(bad)
      expect(gw.verifyWebhook(raw, signPayload(raw, SECRET))).toBeNull()
    }
  })

  test('sandbox checkout session is in TND and has no hosted page', async () => {
    const s = await gw.createCheckoutSession({ bookingId: BOOKING, amount: 45, returnUrl: 'https://x.test' })
    expect(s).toMatchObject({ currency: 'TND', provider: 'test', checkoutUrl: null, amount: 45 })
  })

  test('no gateway and no dev secret in production mode', () => {
    expect(activeGateway('disabled')).toBeNull()
    expect(webhookSecret('test', { NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull()
    expect(webhookSecret('test', { NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeTruthy()
    expect(webhookSecret('test', { NODE_ENV: 'production', PAYMENT_WEBHOOK_SECRET: SECRET } as NodeJS.ProcessEnv)).toBe(SECRET)
  })
})

test.describe('WhatsApp reminders', () => {
  const facts = {
    playerName: 'Amine',
    clubName: 'Padel Tunis',
    sport: 'padel' as const,
    courtName: 'Court 1',
    date: 'sam. 10 oct.',
    time: '18:00 – 19:30',
    clubContact: '98 123 456',
    reference: 'AB12CD34',
  }

  test('localized text carries player, sport, court, time and club contact', () => {
    for (const locale of ['fr', 'en', 'ar'] as const) {
      const m = reminderWhatsappMessage(facts, locale)
      for (const part of ['Amine', 'Padel Tunis', 'Court 1', '18:00', '+21698123456', 'AB12CD34']) expect(m).toContain(part)
    }
    expect(reminderWhatsappMessage(facts, 'fr')).toContain('rappel')
  })

  test('link targets the player number, null when unusable', () => {
    expect(reminderWhatsappLink('+216 22 333 444', facts)).toMatch(/^https:\/\/wa\.me\/21622333444\?text=/)
    expect(reminderWhatsappLink('abc', facts)).toBeNull()
  })

  test('due only inside the 2 h window', () => {
    const now = new Date('2026-10-10T10:00:00Z')
    expect(isReminderDue(new Date('2026-10-10T11:30:00Z'), now)).toBe(true)
    expect(isReminderDue(new Date('2026-10-10T13:00:00Z'), now)).toBe(false)
    expect(isReminderDue(new Date('2026-10-10T09:00:00Z'), now)).toBe(false)
  })
})
