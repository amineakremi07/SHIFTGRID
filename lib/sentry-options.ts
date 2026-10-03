import type { BrowserOptions } from '@sentry/nextjs'

import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry-scrub'

/**
 * Options shared by the browser and server Sentry setups.
 *
 * Sentry is OFF unless a DSN is configured: `SENTRY_DSN` on the server,
 * `NEXT_PUBLIC_SENTRY_DSN` in the browser (it is public by design). With no DSN the
 * SDK is never initialised, nothing is sent and nothing extra is downloaded or run.
 */
/** 10 % of requests are traced: keeps performance data inside the free monthly quota. Override with SENTRY_TRACES_SAMPLE_RATE. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1

/** Session replay: never for ordinary sessions, always for a session that hits an error. */
export const REPLAY_SAMPLE_RATES = { replaysSessionSampleRate: 0.0, replaysOnErrorSampleRate: 1.0 } as const

export function sentryOptions(dsn: string | undefined): BrowserOptions {
  const tracesRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? String(DEFAULT_TRACES_SAMPLE_RATE))
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
    // No `release` here: @sentry/nextjs injects the build's release id (next.config.ts) into the
    // browser, server and edge bundles, so all three report the same release.
    // IPs, cookies, headers and users are never attached: scrubEvent() removes them in beforeSend.
    // 'static' (not the SDK default 'stream'): streamed spans bypass beforeSendTransaction, i.e. the scrubber.
    traceLifecycle: 'static',
    tracesSampleRate: Number.isFinite(tracesRate) ? Math.min(Math.max(tracesRate, 0), 1) : DEFAULT_TRACES_SAMPLE_RATE,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    ignoreErrors: [
      // Expected control flow and noise, not bugs.
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
      /^ResizeObserver loop/,
      'Non-Error promise rejection captured',
    ],
  }
}
