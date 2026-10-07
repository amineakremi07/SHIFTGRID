'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

import { sanitizeEvent, stripQueryAndHash } from '@/lib/analytics-sanitize'
import { INTERNAL_FLAG, INTERNAL_STORAGE_KEY, shouldRegisterInternal } from '@/lib/internal-user'
import { getConsent, replayAllowed, subscribeConsent, TRACKING_CONFIGURED } from '@/lib/consent'
import { registerRecorder } from '@/lib/replay-guard'
import { linkSentryToPostHog, unlinkSentryFromPostHog } from '@/lib/sentry-link'

/**
 * PostHog analytics behind a consent gate, loaded lazily and guarded to stay in the free tier.
 *
 * Consent (lib/consent.ts, chosen in components/consent/consent-banner.tsx)
 *  - Nothing is downloaded, initialised or stored until the visitor accepts "Usage analytics":
 *    `posthog-js` is only `import()`ed after that. Stricter than opt_out_capturing_by_default,
 *    which would still load the SDK and write storage.
 *  - PostHog's own defaults are also "off" (opt_out_capturing_by_default, opt_out_persistence_by_default),
 *    and it is opted in explicitly. Revoking opts out, stops recording, resets and deletes `ph_*` storage.
 *  - Session recordings need the separate "Session recordings" consent, never run on excluded routes
 *    (replayAllowed: dashboards, admin, reservations/passes, auth, invite links), mask ALL text and inputs,
 *    block `.ph-no-capture`/file inputs/canvas, and record no console, network headers, bodies or timings.
 *    Client-side navigation INTO an excluded page is stopped before it starts by lib/replay-guard.ts
 *    (onRouterTransitionStart); the effect below only restarts recording on allowed pages.
 *
 * Volume guardrails: identified_only person profiles, one manual $pageview per path, no autocapture,
 * no pageleave, debug only in development with NEXT_PUBLIC_POSTHOG_DEBUG=1.
 * Privacy: `before_send` strips query strings/fragments from every URL property (secret ?token= links).
 * Without NEXT_PUBLIC_POSTHOG_KEY and _HOST (inlined at build time) none of this runs.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV

/** Tag this browser's events as team traffic when it is a local/dev machine or a team member opted in. */
function applyInternalFlag(posthog: PostHog) {
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    /* storage blocked */
  }
  if (shouldRegisterInternal({ hostname: window.location.hostname, appEnv: APP_ENV, nodeEnv: process.env.NODE_ENV, storage })) {
    posthog.register({ ...INTERNAL_FLAG })
  } else {
    posthog.unregister('is_internal_user')
  }
}

/**
 * Console helper for team members on production: `shiftgridInternal.enable()` marks this browser as
 * internal (kept in localStorage `sg-internal`), `.disable()` undoes it. Takes effect on the next
 * PostHog load and at once if PostHog is already running (i.e. the visitor accepted analytics).
 */
function installConsoleHelper() {
  const set = (on: boolean) => {
    try {
      if (on) window.localStorage.setItem(INTERNAL_STORAGE_KEY, '1')
      else window.localStorage.removeItem(INTERNAL_STORAGE_KEY)
    } catch {
      console.warn('ShiftGrid: browser storage is blocked, the internal flag could not be saved.')
      return
    }
    if (instance) applyInternalFlag(instance)
    console.info(
      on
        ? 'ShiftGrid: this browser is now marked is_internal_user = true.' + (instance ? '' : ' It applies once analytics consent is given.')
        : 'ShiftGrid: internal flag removed from this browser.'
    )
  }
  ;(window as unknown as { shiftgridInternal?: unknown }).shiftgridInternal = {
    enable: () => set(true),
    disable: () => set(false),
  }
}

type PostHog = (typeof import('posthog-js'))['default']
let loading: Promise<PostHog | null> | null = null
/** Set once the SDK has been initialised in this page session (needed to opt out later). */
let instance: PostHog | null = null

function loadPostHog(): Promise<PostHog | null> {
  if (!TRACKING_CONFIGURED || !KEY || !HOST) return Promise.resolve(null)
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(KEY, {
          // Same-origin reverse proxy (rewrites in next.config.ts); ui_host keeps toolbar/replay links on PostHog EU.
          api_host: '/ingest',
          ui_host: 'https://eu.posthog.com',
          person_profiles: 'identified_only',
          capture_pageview: false,
          capture_pageleave: false,
          autocapture: false,
          // Off until opted in below; no cookies/localStorage while opted out.
          opt_out_capturing_by_default: true,
          opt_out_persistence_by_default: true,
          // Recording starts only through startSessionRecording() (see the provider).
          disable_session_recording: true,
          // Console output (error/warn survive production builds) is recorded with replays, which need their own consent.
          enable_recording_console_log: true,
          // Unhandled errors and promise rejections become `$exception` events (still behind the analytics consent).
          capture_exceptions: true,
          capture_performance: false,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '*',
            blockSelector: '.ph-no-capture, [data-ph-block], input[type="file"], canvas',
            recordHeaders: false,
            recordBody: false,
            maskCapturedNetworkRequestFn: (request) => ({ ...request, name: stripQueryAndHash(request.name) }),
          },
          before_send: (event) => sanitizeEvent(event),
          debug: process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_POSTHOG_DEBUG === '1',
        })
      }
      instance = posthog
      applyInternalFlag(posthog)
      // Lets instrumentation-client.ts stop recording before navigating into an excluded page.
      registerRecorder(posthog)
      return posthog
    })
    .catch((error) => {
      // Analytics must never break the app (blocked chunk, offline, ...).
      console.warn('PostHog failed to load', error)
      loading = null
      return null
    })
  return loading
}

/**
 * Send a product event from the browser, e.g. `trackEvent('booking.created', { sport })`.
 * Consent-gated: a no-op until the visitor accepted analytics and PostHog has loaded; never throws.
 * Pass only ids and labels (no names, contacts or tokens).
 */
export function trackEvent(event: string, props?: Record<string, string | number | boolean | null | undefined>) {
  try {
    if (!instance || !instance.has_opted_in_capturing()) return
    instance.capture(event, { ...props, source_runtime: 'client' })
  } catch {
    /* analytics must never break the app */
  }
}

/** Remove everything PostHog may have stored in this browser. */
function clearPostHogStorage() {
  const isPh = (k: string) => /^(ph_|__ph)/.test(k)
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (const k of Object.keys(store)) if (isPh(k)) store.removeItem(k)
    } catch {
      /* storage blocked */
    }
  }
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name && isPh(name)) {
      // Expire on this host and on the parent domain PostHog may have used.
      document.cookie = `${name}=; Max-Age=0; path=/`
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname.replace(/^www\./, '')}`
    }
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useEffect(() => {
    if (TRACKING_CONFIGURED) installConsoleHelper()
  }, [])
  // Server snapshot is null: nothing optional renders or runs before hydration.
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null)
  const analytics = TRACKING_CONFIGURED && consent?.analytics === true
  const replay = analytics && consent?.replay === true

  // Grant / revoke.
  useEffect(() => {
    if (!TRACKING_CONFIGURED) return
    if (analytics) {
      void loadPostHog().then((posthog) => {
        if (posthog && !posthog.has_opted_in_capturing()) posthog.opt_in_capturing()
      })
    } else if (instance) {
      // Was on in this page session and has been withdrawn.
      unlinkSentryFromPostHog(Sentry)
      instance.stopSessionRecording()
      instance.opt_out_capturing()
      instance.reset()
      clearPostHogStorage()
    }
  }, [analytics])

  // One pageview per path while opted in; recording follows consent and the route.
  useEffect(() => {
    if (!analytics) return
    let cancelled = false
    void loadPostHog().then((posthog) => {
      // Strict Mode mounts twice in development: ignore a load that outlived its effect.
      if (cancelled || !posthog) return
      if (!posthog.has_opted_in_capturing()) posthog.opt_in_capturing()
      if (replay && replayAllowed(pathname)) {
        if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording()
      } else if (posthog.sessionRecordingStarted()) {
        posthog.stopSessionRecording()
      }
      posthog.capture('$pageview', { $current_url: stripQueryAndHash(window.location.href) })
      // Errors reported from here on point back to this PostHog session (and its replay, when recording).
      linkSentryToPostHog(posthog, Sentry)
    })
    return () => {
      cancelled = true
    }
  }, [pathname, analytics, replay])

  return <>{children}</>
}
