import { after } from 'next/server'

/**
 * Server-side operational telemetry to PostHog: rate-limit blocks, request timings and audit events.
 *
 * Privacy: these are SYSTEM events, not visitor tracking. They are sent with one fixed anonymous
 * `distinct_id` and no person profile, and callers must pass only non-personal facts (route names,
 * counts, booking/court/club row ids, status codes, a role label). Never an email, phone, name, IP,
 * user id, token or link. Values are reduced to short primitives here as a last line of defence.
 *
 * Reliability: sending is fire-and-forget (inside Next's `after()` when there is a request to attach
 * it to), has a short timeout and swallows every error. Telemetry can never slow down, fail or change
 * the outcome of a request. Without NEXT_PUBLIC_POSTHOG_KEY + _HOST (or with TELEMETRY_DISABLED=1)
 * nothing is sent at all.
 */

type Primitive = string | number | boolean | null | undefined
export type TelemetryProps = Record<string, Primitive>

export type TelemetryEvent = 'rate_limit_exceeded' | 'api_request_perf' | 'audit_log_event' | 'booking.created' | 'booking.cancelled'

const SERVER_DISTINCT_ID = 'shiftgrid-server'
const TIMEOUT_MS = 3000
const MAX_STRING = 120

function config(): { key: string; host: string } | null {
  if (process.env.TELEMETRY_DISABLED === '1') return null
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) return null
  return { key, host: host.replace(/\/+$/, '') }
}

/** Primitives only, strings cut short, no query strings (they can carry secret tokens). */
export function cleanProps(props: TelemetryProps): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue
    if (typeof v === 'string') out[k] = v.split(/[?#]/)[0].slice(0, MAX_STRING)
    else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : null
    else out[k] = v
  }
  return out
}

/** The request path without query string or fragment, for `route` / `endpoint` properties. */
export const pathOf = (urlOrPath: string | null | undefined): string => {
  if (!urlOrPath) return 'unknown'
  try {
    return new URL(urlOrPath, 'http://local').pathname
  } catch {
    return 'unknown'
  }
}

async function send(event: TelemetryEvent, props: TelemetryProps) {
  const cfg = config()
  if (!cfg) return
  try {
    const production = process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')
    await fetch(`${cfg.host}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: cfg.key,
        event,
        distinct_id: SERVER_DISTINCT_ID,
        properties: {
          ...cleanProps(props),
          source_runtime: 'server',
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
          // Local and preview traffic is filtered with the same flag as the browser.
          is_internal_user: !production,
          $process_person_profile: false,
          $lib: 'shiftgrid-server',
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    /* telemetry must never surface an error */
  }
}

/** Queue an event. Never throws, never awaited by callers. */
export function captureServerEvent(event: TelemetryEvent, props: TelemetryProps): void {
  if (!config()) return
  try {
    after(() => send(event, props))
  } catch {
    // No request scope (e.g. a script or the proxy): plain fire-and-forget.
    void send(event, props)
  }
}

/* ------------------------------ typed helpers ------------------------------ */

/** A request was refused by the limiter, or lost the race for a slot. */
export function captureRateLimit(p: {
  route: string
  limit: number
  remaining: number
  source: 'upstash_redis' | 'memory' | 'slot_lock'
  rule?: string
}) {
  captureServerEvent('rate_limit_exceeded', p)
}

/** A business action worth an audit trail. `status` is the resulting state or outcome. */
export function captureAudit(p: {
  action: string
  status: string
  booking_id?: string
  court_id?: string
  org_id?: string
  /** Role label of the actor ('player' | 'guest' | 'staff' | 'org_admin' | 'platform_admin' | 'api_key'), never an id. */
  actor?: string
  detail?: string
}) {
  captureServerEvent('audit_log_event', p)
}

/** `booking.created` / `booking.cancelled`: ids and labels only, never names, contacts or tokens. */
export function captureBooking(
  event: 'booking.created' | 'booking.cancelled',
  p: {
    booking_id: string
    org_id?: string
    court_id?: string
    sport?: string
    status?: string
    amount?: number
    payment?: string
    /** 'member' | 'guest' | 'staff' | 'player' | 'org_admin' ... (a label, never an id). */
    actor?: string
    source?: string
  }
) {
  captureServerEvent(event, p)
}

function statusOf(result: unknown): string {
  if (result instanceof Response) return String(result.status)
  const r = result as { ok?: unknown; code?: unknown; status?: unknown } | null | undefined
  if (r && typeof r === 'object' && 'ok' in r) {
    if (r.ok) return 'ok'
    return typeof r.code === 'string' ? r.code : typeof r.status === 'number' ? String(r.status) : 'error'
  }
  return 'ok'
}

/**
 * Time a server action or route handler and report `api_request_perf` {endpoint, duration_ms, status}.
 * `status` is 'ok', the action's error `code`, the HTTP status of a Response, or 'exception' when it threw
 * (the error is re-thrown untouched).
 */
export async function timed<T>(endpoint: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now()
  try {
    const result = await run()
    captureServerEvent('api_request_perf', { endpoint, duration_ms: Math.round(performance.now() - started), status: statusOf(result) })
    return result
  } catch (error) {
    captureServerEvent('api_request_perf', { endpoint, duration_ms: Math.round(performance.now() - started), status: 'exception' })
    throw error
  }
}
