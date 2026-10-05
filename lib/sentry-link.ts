/**
 * Links Sentry errors to the PostHog person/session they happened in, so an error report leads to the
 * session replay. Browser only, and only while PostHog is running, which means the visitor consented to
 * analytics (`lib/consent.ts`); on withdrawal the tags are removed. The ids are PostHog's anonymous
 * random ones (person profiles are `identified_only`), never an account id, email or name.
 * Pure: PostHog and Sentry are passed in, so it is unit-tested without either SDK.
 */

export const SENTRY_POSTHOG_TAGS = ['posthog_distinct_id', 'posthog_session_id'] as const

type PostHogLike = {
  get_distinct_id(): string
  get_session_id(): string
  sessionRecordingStarted(): boolean
  get_session_replay_url?: (options?: { withTimestamp?: boolean; timestampLookBack?: number }) => string
}

type SentryLike = {
  setTag(key: string, value: string | undefined): void
  setContext(name: string, context: Record<string, unknown> | null): void
}

export function linkSentryToPostHog(posthog: PostHogLike, sentry: SentryLike): void {
  const distinctId = posthog.get_distinct_id()
  const sessionId = posthog.get_session_id()
  sentry.setTag('posthog_distinct_id', distinctId || undefined)
  sentry.setTag('posthog_session_id', sessionId || undefined)
  // The replay link only makes sense while a recording of this session exists.
  const replayUrl = posthog.sessionRecordingStarted() && posthog.get_session_replay_url ? posthog.get_session_replay_url({ withTimestamp: true, timestampLookBack: 30 }) : null
  sentry.setContext('posthog', replayUrl ? { session_replay_url: replayUrl } : null)
}

export function unlinkSentryFromPostHog(sentry: SentryLike): void {
  for (const tag of SENTRY_POSTHOG_TAGS) sentry.setTag(tag, undefined)
  sentry.setContext('posthog', null)
}
