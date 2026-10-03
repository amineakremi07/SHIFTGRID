import * as Sentry from '@sentry/nextjs'

import { sentryOptions } from '@/lib/sentry-options'

/** Edge-runtime Sentry. Unused today (Next.js 16 runs the proxy and all routes on Node.js); see instrumentation.ts. */
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init(sentryOptions(dsn))
}
