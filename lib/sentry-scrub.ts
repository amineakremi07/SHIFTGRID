/**
 * Strips personal data and secrets from anything sent to Sentry. Pure (no Sentry
 * import, no I/O) so it is unit-tested and shared by the browser and server configs.
 *
 * Two layers: (1) known-sensitive keys are replaced wherever they appear in the
 * event, (2) every string is pattern-scrubbed (JWTs, bearer tokens, our hex link
 * tokens, Supabase keys, emails, Tunisian phone numbers, secrets in query strings),
 * so a secret that slipped into an error message or breadcrumb is still removed.
 */

const FILTERED = '[Filtered]'

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwd|pwd|secret|token|access_token|refresh_token|id_token|apikey|api_key|x-api-key|email|phone|full_?name|display_?name|guest_?name|payer_?name|x-forwarded-for|x-real-ip|ip_address|cancel_?token|invite_?token|guest_?token|service_?role.*|.*_secret|.*_token)$/i

const PATTERNS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [token]'],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[supabase-key]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  [/(?:\+|00)?216[\s.-]?[2459]\d(?:[\s.-]?\d{3}){2}/g, '[phone]'],
  // Our share / cancel / invite links carry 48+ hex chars; booking ids are uuids (dashes), so they survive.
  [/\b[0-9a-f]{32,}\b/gi, '[hex-token]'],
  [/([?&](?:token|access_token|refresh_token|code|key|apikey|api_key|password|secret|email)=)[^&#\s"']*/gi, `$1${FILTERED}`],
]

/** Sentry's own identifiers are 32-hex strings; scrubbing them would break event ids and trace correlation. */
const IDENTIFIER_KEY = /^(event_id|trace_id|span_id|parent_span_id|public_key|debug_id|sentry_trace|baggage)$/i

export function scrubString(value: string): string {
  let out = value
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out
}

/** Recursively scrub a JSON-like value. Depth- and size-bounded so a huge payload cannot stall the reporter. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubString(value) as T
  if (value === null || typeof value !== 'object') return value
  if (depth > 8) return FILTERED as T
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => scrubValue(v, depth + 1)) as T

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (IDENTIFIER_KEY.test(key) && typeof v === 'string') out[key] = v
    else out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(v, depth + 1)
  }
  return out as T
}

type Scrubbable = {
  user?: unknown
  request?: { cookies?: unknown; data?: unknown; headers?: Record<string, unknown>; url?: string; query_string?: unknown }
  server_name?: string
  [key: string]: unknown
}

/**
 * For `beforeSend` / `beforeSendTransaction`. Returns the cleaned event; never null
 * (dropping would hide real errors). Request bodies and cookies are removed entirely,
 * the user object is removed (no id, email or IP is attached), the rest is scrubbed.
 */
export function scrubEvent<E extends object>(event: E): E {
  const copy = { ...event } as Scrubbable
  delete copy.user
  delete copy.server_name
  if (copy.request) {
    const { cookies: _cookies, data: _data, headers, ...rest } = copy.request
    void _cookies
    void _data
    copy.request = { ...rest, headers: headers ? (scrubValue(headers) as Record<string, unknown>) : undefined }
  }
  return scrubValue(copy) as E
}

export function scrubBreadcrumb<B extends { data?: unknown; message?: string; category?: string }>(crumb: B): B | null {
  // Console and fetch breadcrumbs are where payloads leak; keep the fact, not the content.
  if (crumb.category === 'console') return { ...crumb, data: undefined, message: crumb.message ? scrubString(crumb.message) : crumb.message }
  return scrubValue(crumb)
}
