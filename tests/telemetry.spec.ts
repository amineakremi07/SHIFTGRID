import { expect, test } from '@playwright/test'

import { linkSentryToPostHog, unlinkSentryFromPostHog } from '../lib/sentry-link'
import { cleanProps, pathOf } from '../lib/telemetry'
import { scrubEvent } from '../lib/sentry-scrub'

test('telemetry properties are reduced to short, query-free primitives', () => {
  const out = cleanProps({
    route: '/api/v1/bookings/check-in?token=abc',
    limit: 10,
    remaining: Number.NaN,
    ok: true,
    nothing: undefined,
    long: 'x'.repeat(500),
  })
  expect(out.route).toBe('/api/v1/bookings/check-in')
  expect(out.remaining).toBeNull()
  expect('nothing' in out).toBe(false)
  expect((out.long as string).length).toBe(120)
  expect(pathOf('https://shiftgridtn.vercel.app/reservations/abc?token=secret#x')).toBe('/reservations/abc')
  expect(pathOf(null)).toBe('unknown')
})

function fakes(recording: boolean) {
  const tags: Record<string, string | undefined> = {}
  const contexts: Record<string, unknown> = {}
  return {
    tags,
    contexts,
    sentry: {
      setTag: (k: string, v: string | undefined) => void (tags[k] = v),
      setContext: (n: string, c: Record<string, unknown> | null) => void (contexts[n] = c),
    },
    posthog: {
      get_distinct_id: () => '0199-distinct',
      get_session_id: () => '0199-session',
      sessionRecordingStarted: () => recording,
      get_session_replay_url: () => 'https://eu.posthog.com/project/1/replay/0199-session?t=12',
    },
  }
}

test('Sentry gets the PostHog ids, and the replay link only while recording', () => {
  const a = fakes(true)
  linkSentryToPostHog(a.posthog, a.sentry)
  expect(a.tags).toEqual({ posthog_distinct_id: '0199-distinct', posthog_session_id: '0199-session' })
  expect(a.contexts.posthog).toEqual({ session_replay_url: 'https://eu.posthog.com/project/1/replay/0199-session?t=12' })

  const b = fakes(false)
  linkSentryToPostHog(b.posthog, b.sentry)
  expect(b.contexts.posthog).toBeNull()

  unlinkSentryFromPostHog(a.sentry)
  expect(a.tags.posthog_distinct_id).toBeUndefined()
  expect(a.contexts.posthog).toBeNull()
})

test('the Sentry scrubber leaves the PostHog link readable', () => {
  const event = scrubEvent({
    tags: { posthog_distinct_id: '0199-distinct', posthog_session_id: '0199-session' },
    contexts: { posthog: { session_replay_url: 'https://eu.posthog.com/project/1/replay/0199-session?t=12' } },
  })
  expect(event.tags.posthog_session_id).toBe('0199-session')
  expect(event.contexts.posthog.session_replay_url).toContain('/replay/0199-session')
})
