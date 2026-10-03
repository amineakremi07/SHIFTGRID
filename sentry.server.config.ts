import * as Sentry from '@sentry/nextjs'

import { sentryOptions } from '@/lib/sentry-options'

/** Server-side Sentry (Server Actions, route handlers, RSC, the proxy). Loaded by instrumentation.ts. */
// One DSN is enough: NEXT_PUBLIC_SENTRY_DSN is used when no server-only SENTRY_DSN is set.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init(sentryOptions(dsn))
}
