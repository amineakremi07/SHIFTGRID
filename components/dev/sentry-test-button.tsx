'use client'

import * as Sentry from '@sentry/nextjs'
import { toast } from 'sonner'

/**
 * TEMPORARY: proves Sentry captures a production error and resolves its stack with the
 * uploaded source maps. Remove this file and its use in app/page.tsx once confirmed.
 */
export function SentryTestButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const eventId = Sentry.captureException(new Error('ShiftGrid Manual Sentry Production Test'))
        // No client DSN in the build means Sentry was never initialised and nothing is sent.
        if (Sentry.getClient()) toast.success(`Sent to Sentry (event ${eventId})`)
        else toast.error('Sentry is not initialised: NEXT_PUBLIC_SENTRY_DSN was not set at build time')
      }}
      className="fixed bottom-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-red-700"
    >
      Test Sentry
    </button>
  )
}
