import * as Sentry from '@sentry/nextjs'

import { pauseRecordingBeforeNavigation } from '@/lib/replay-guard'
import { REPLAY_SAMPLE_RATES, sentryOptions } from '@/lib/sentry-options'

/**
 * Browser-side Sentry. In Next.js 16 with Turbopack this file (not
 * `sentry.client.config.ts`, which Turbopack does not load) is the client entry.
 * Replay records only the session of an error (see REPLAY_SAMPLE_RATES) and masks ALL text,
 * inputs and media, because the pages hold names and phone numbers. No feedback widget.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    ...sentryOptions(dsn),
    ...REPLAY_SAMPLE_RATES,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
  })
}

/**
 * Runs when an App Router navigation is dispatched, before the new route renders:
 * stop any PostHog recording first if the destination must never be recorded, then let
 * Sentry trace the navigation.
 */
export function onRouterTransitionStart(url: string, navigationType: 'push' | 'replace' | 'traverse') {
  pauseRecordingBeforeNavigation(url)
  Sentry.captureRouterTransitionStart(url, navigationType)
}
