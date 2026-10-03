import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  // The proxy and every route run on Node.js in Next.js 16, so nothing uses this today; it is
  // here so that a route that opts into the edge runtime later is still reported.
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/** Unhandled errors from Server Components, Server Actions and route handlers. */
export const onRequestError = Sentry.captureRequestError
