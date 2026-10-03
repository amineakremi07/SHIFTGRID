import * as Sentry from '@sentry/nextjs'
import { expect, test } from '@playwright/test'

import { HEARTBEAT_MS, POLL_DOWN_MS, backoffDelay } from '../lib/realtime/bookings-feed'
import { REPLAY_SAMPLE_RATES, sentryOptions } from '../lib/sentry-options'
import { sanitizeEvent } from '../lib/analytics-sanitize'
import { scrubEvent, scrubString, scrubValue } from '../lib/sentry-scrub'

/** Pure checks (no browser, no database): nothing personal may leave in an error report. */

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'
const HEX48 = 'a'.repeat(24) + '0123456789ab'.repeat(2)

test.describe('scrubString', () => {
  test('removes tokens, keys, emails, phones and secret query values', () => {
    const dirty = [
      `auth failed for amine@example.tn with ${JWT}`,
      `Authorization: Bearer abc.def-123`,
      `key sb_secret_AbCdEf123456`,
      `call +216 98 123 456 or 0021622345678`,
      `GET /reservations/cancel-guest?token=${HEX48}&x=1`,
      `link /reservations/join?t=${HEX48}`,
    ].join(' | ')
    const clean = scrubString(dirty)
    for (const leaked of ['amine@example.tn', JWT, 'abc.def-123', 'sb_secret_AbCdEf123456', '98 123 456', '22345678', HEX48]) {
      expect(clean, leaked).not.toContain(leaked)
    }
    expect(clean).toContain('x=1') // non-secret parts survive
  })

  test('keeps booking ids (uuids) readable for debugging', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(scrubString(`booking ${id} failed`)).toContain(id)
  })
})

test.describe('scrubEvent', () => {
  test('drops user, cookies, request body; filters sensitive headers and keys', () => {
    const event = {
      user: { id: 'u1', email: 'x@y.tn', ip_address: '1.2.3.4' },
      server_name: 'host-1',
      request: {
        url: 'https://shiftgrid.tn/accept-invite?token=' + HEX48,
        cookies: { 'sb-abc-auth-token': JWT },
        data: { password: 'hunter2' },
        headers: { cookie: 'sb=1', authorization: 'Bearer zzz', 'user-agent': 'test', 'x-forwarded-for': '9.9.9.9' },
      },
      exception: { values: [{ type: 'Error', value: `failed for ${JWT}` }] },
      extra: { phone: '+21698123456', display_name: 'Amine', code: '23P01', nested: { refresh_token: 'r', ok: 1 } },
      breadcrumbs: [{ message: 'sent to a@b.tn', data: { email: 'a@b.tn' } }],
    }
    const out = JSON.stringify(scrubEvent(event))
    for (const leaked of ['x@y.tn', '1.2.3.4', 'host-1', 'hunter2', 'sb=1', 'zzz', '9.9.9.9', JWT, HEX48, '98123456', 'Amine', 'a@b.tn', '"refresh_token":"r"']) {
      expect(out, leaked).not.toContain(leaked)
    }
    expect(out).toContain('23P01') // useful diagnostics are kept
    expect(out).toContain('"ok":1')
    const cleaned = scrubEvent(event)
    expect(cleaned.user).toBeUndefined()
    expect(cleaned.request.cookies).toBeUndefined()
    expect(cleaned.request.data).toBeUndefined()
  })

  test('handles cyclic-depth payloads without hanging', () => {
    let deep: Record<string, unknown> = { v: 'x' }
    for (let i = 0; i < 50; i++) deep = { child: deep }
    expect(() => scrubValue(deep)).not.toThrow()
  })
})

test.describe('Sentry wiring', () => {
  test('without a DSN the SDK is disabled', () => {
    expect(sentryOptions(undefined).enabled).toBe(false)
    expect(sentryOptions('https://k@o1.ingest.sentry.io/2').enabled).toBe(true)
  })

  test('a real captured error reaches the transport already scrubbed', async () => {
    const sent: string[] = []
    Sentry.init({
      ...sentryOptions('https://publickey@o0.ingest.sentry.io/1'),
      tracesSampleRate: 0,
      transport: () => ({
        send: async (envelope: unknown) => {
          sent.push(JSON.stringify(envelope))
          return {}
        },
        flush: async () => true,
      }),
    } as Parameters<typeof Sentry.init>[0])

    Sentry.setUser({ id: 'u1', email: 'owner@club.tn', ip_address: '5.6.7.8' })
    Sentry.captureException(new Error(`booking failed for owner@club.tn token=${HEX48} phone +21698123456`))
    await Sentry.flush(2000)

    // Envelope = [header, [[itemHeader, payload]]]; read the event itself.
    const envelope = JSON.parse(sent[0]) as [unknown, [unknown, { exception: { values: { value: string }[] }; user?: unknown; event_id: string; contexts: { trace: { trace_id: string } } }][]]
    const event = envelope[1][0][1]
    const message = event.exception.values[0].value
    expect(message).toBe('booking failed for [email] token=[hex-token] phone [phone]')
    expect(event.user).toBeUndefined()
    // Sentry's own identifiers survive (a scrubbed event_id/trace_id would break correlation).
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(event.contexts.trace.trace_id).toMatch(/^[0-9a-f]{32}$/)
    await Sentry.close(1000)
  })
})

test.describe('realtime fallback timings', () => {
  test('backoff grows, is capped at ~30 s, and is jittered', () => {
    const mid = (n: number) => backoffDelay(n, 0.5)
    expect(mid(0)).toBe(1000)
    expect(mid(1)).toBe(2000)
    expect(mid(3)).toBe(8000)
    expect(mid(10)).toBe(30000)
    expect(backoffDelay(2, 0)).toBe(3000) // -25%
    expect(backoffDelay(2, 1)).toBe(5000) // +25%
    expect(backoffDelay(-1, 0.5)).toBe(1000)
  })

  test('fallback polling is fast when down, a slow heartbeat when up', () => {
    expect(POLL_DOWN_MS).toBeLessThanOrEqual(15_000)
    expect(HEARTBEAT_MS).toBeGreaterThanOrEqual(60_000)
  })
})

test.describe('cost guardrails', () => {
  test('traces are sampled at 10 % by default and replays only on error', () => {
    const saved = process.env.SENTRY_TRACES_SAMPLE_RATE
    delete process.env.SENTRY_TRACES_SAMPLE_RATE
    try {
      expect(sentryOptions('https://k@o0.ingest.sentry.io/1').tracesSampleRate).toBe(0.1)
    } finally {
      if (saved !== undefined) process.env.SENTRY_TRACES_SAMPLE_RATE = saved
    }
    expect(REPLAY_SAMPLE_RATES).toEqual({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 })
  })

  test('an out-of-range or invalid rate is clamped, never trusted', () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '5'
    expect(sentryOptions('x').tracesSampleRate).toBe(1)
    process.env.SENTRY_TRACES_SAMPLE_RATE = 'abc'
    expect(sentryOptions('x').tracesSampleRate).toBe(0.1)
    delete process.env.SENTRY_TRACES_SAMPLE_RATE
  })
})

test.describe('analytics never receives secret links', () => {
  test('query strings and fragments are stripped from every URL property', () => {
    const event = {
      event: '$pageview',
      properties: {
        $current_url: 'https://shiftgrid.tn/reservations/join?token=' + HEX48 + '#x',
        $referrer: 'https://shiftgrid.tn/reservations/cancel-guest?token=' + HEX48,
        $pathname: '/reservations/9f1c',
        $browser: 'Chrome',
        plan: 'a?b',
      },
    }
    const out = sanitizeEvent(event)
    expect(out.properties.$current_url).toBe('https://shiftgrid.tn/reservations/join')
    expect(out.properties.$referrer).toBe('https://shiftgrid.tn/reservations/cancel-guest')
    expect(out.properties.$pathname).toBe('/reservations/9f1c')
    expect(out.properties.plan).toBe('a?b') // only known URL keys are touched
    expect(JSON.stringify(out)).not.toContain(HEX48)
    expect(sanitizeEvent(null)).toBeNull()
  })
})
