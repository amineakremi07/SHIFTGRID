import { expect, test } from '@playwright/test'

import { deliver } from '../lib/notifications/mailer'

/** deliver() must report email.skipped / email.failed to PostHog and finish them BEFORE it resolves. */
const KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'EMAIL_DRY_RUN', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST', 'TELEMETRY_DISABLED'] as const

test.describe('email telemetry', () => {
  const saved: Record<string, string | undefined> = {}
  const events: string[] = []
  const realFetch = globalThis.fetch

  test.beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] }
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://ph.test'
    events.length = 0
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      await new Promise((r) => setTimeout(r, 20)) // a slow capture must still be awaited
      events.push(JSON.parse(String(init?.body)).event)
      return new Response('{}')
    }) as typeof fetch
  })
  test.afterEach(() => {
    globalThis.fetch = realFetch
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  })

  const msg = { to: 'a@example.org', subject: 's', html: '<p>x</p>', type: 'booking_confirmation' }

  test('no SMTP configured: email.skipped is recorded before deliver resolves', async () => {
    const r = await deliver(msg)
    expect(r.status).toBe('skipped')
    expect(events).toEqual(['email.skipped'])
  })

  test('unreachable SMTP: email.failed is recorded before deliver resolves', async () => {
    process.env.SMTP_HOST = '127.0.0.1'
    process.env.SMTP_PORT = '1'
    const r = await deliver(msg)
    expect(r.status).toBe('failed')
    expect(events).toContain('email.failed')
    expect(events).toContain('api_request_perf')
  })
})
