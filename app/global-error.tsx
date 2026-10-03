'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/** Last-resort boundary: replaces the root layout when it (or the page shell) crashes. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f5f2', color: '#2a1a1d', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#645757' }}>
            We have been notified. Your bookings are safe. Please try again{error.digest ? ` (ref ${error.digest})` : ''}.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '10px 18px', borderRadius: 8, border: 0, background: '#26d862', color: '#2a1a1d', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
