import * as Sentry from '@sentry/nextjs'

/**
 * Report an error the code handled (so Next never sees it) but that still means
 * something is wrong: an unexpected database failure, a payment step that broke.
 * `area` becomes a Sentry tag; `extra` must hold only non-personal facts (codes, ids
 * of rows), and is scrubbed again before sending. A no-op without a DSN.
 */
export function reportServerError(area: string, error: unknown, extra?: Record<string, string | number | boolean | null | undefined>) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  Sentry.captureException(err, { tags: { area }, extra })
}
