'use client'

import { useEffect } from 'react'

/**
 * PostHog analytics, loaded lazily.
 *
 * `posthog-js` is pulled in with a dynamic import() inside the effect, so it is
 * a separate chunk that is only downloaded (asynchronously, after hydration)
 * when NEXT_PUBLIC_POSTHOG_KEY is set. Without a key nothing is fetched.
 *
 * Deliberately no `PostHogProvider` from `posthog-js/react`: that module imports
 * `posthog-js` statically and would put the whole library back in the initial
 * bundle. To use PostHog elsewhere, `import('posthog-js')` at the call site; it
 * returns the same singleton this effect initialises.
 */
export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    // Strict Mode mounts, unmounts and remounts in development: ignore a load
    // that resolves after its effect was cleaned up.
    let cancelled = false

    import('posthog-js')
      .then(({ default: posthog }) => {
        if (cancelled || posthog.__loaded) return

        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
          // Anonymous visitors produce events but no person profile (cheaper, and
          // avoids storing personal data until someone signs in and is identified).
          person_profiles: 'identified_only',
          autocapture: true,
          // 'history_change' also tracks App Router client-side navigations, which
          // the default (initial load only) would miss.
          capture_pageview: 'history_change',
          capture_pageleave: true,
        })
      })
      .catch((error) => {
        // Analytics must never break the app (blocked chunk, offline, etc.).
        console.warn('PostHog failed to load', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
