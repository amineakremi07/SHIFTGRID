/**
 * Visitor consent for optional tracking (PostHog). Two independent purposes:
 *  - analytics: anonymous usage events and pageviews;
 *  - replay: session recordings (needs analytics, all text and inputs masked).
 * Nothing optional runs until the visitor chooses. The choice lives in localStorage
 * (per browser, never sent to us). Bumping CONSENT_VERSION asks everyone again, e.g.
 * when a new purpose or provider is added.
 *
 * Pure helpers (parse, replayAllowed) are unit-tested in tests/consent.spec.ts; the
 * store functions touch window and are guarded so they are safe during SSR.
 */
export const CONSENT_VERSION = 1
export const CONSENT_STORAGE_KEY = 'sg-consent'
const CHANGE_EVENT = 'sg-consent-change'
const OPEN_EVENT = 'sg-consent-open'

export type Consent = {
  v: number
  analytics: boolean
  /** Only meaningful with analytics: recordings are sent through the analytics client. */
  replay: boolean
  /** When the choice was made (ISO). */
  at: string
}

/** Parse a stored value. Anything malformed or from an older version counts as "no choice yet". */
export function parseConsent(raw: string | null): Consent | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Consent>
    if (value?.v !== CONSENT_VERSION || typeof value.analytics !== 'boolean' || typeof value.replay !== 'boolean') return null
    return { v: CONSENT_VERSION, analytics: value.analytics, replay: value.analytics && value.replay, at: String(value.at ?? '') }
  } catch {
    return null
  }
}

export function makeConsent(analytics: boolean, replay: boolean, now = new Date()): Consent {
  return { v: CONSENT_VERSION, analytics, replay: analytics && replay, at: now.toISOString() }
}

/**
 * Pages never recorded, even with consent: they show other people's personal data (club
 * dashboards, admin), auth forms, secret links or booking QR codes.
 */
const REPLAY_EXCLUDED = [
  /^\/dashboard(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/reservations(\/|$)/,
  /^\/accept-invite(\/|$)/,
  /^\/login(-owner)?(\/|$)/,
  /^\/register(\/|$)/,
  /^\/signup-owner(\/|$)/,
  /^\/logout(\/|$)/,
]

export function replayAllowed(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || '/'
  return !REPLAY_EXCLUDED.some((re) => re.test(path))
}

/* ----------------------------------- store ----------------------------------- */

// useSyncExternalStore needs a stable snapshot: cache by the raw stored string.
let cachedRaw: string | null | undefined
let cached: Consent | null = null

export function getConsent(): Consent | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
  } catch {
    raw = null // storage blocked: ask again each visit, never assume consent
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parseConsent(raw)
  }
  return cached
}

export function setConsent(consent: Consent): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent))
  } catch {
    // Storage blocked: the choice applies to this page view only.
    cachedRaw = JSON.stringify(consent)
    cached = consent
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Fires on a change in this tab or another tab. Returns an unsubscribe function. */
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CONSENT_STORAGE_KEY) callback()
  }
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
  }
}

/** Re-open the consent panel ("Cookie settings" links). */
export function openConsentSettings(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_EVENT))
}

export function subscribeOpenSettings(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(OPEN_EVENT, callback)
  return () => window.removeEventListener(OPEN_EVENT, callback)
}

/** Whether optional tracking exists in this build at all (both PostHog values are inlined at build time). */
export const TRACKING_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST)
