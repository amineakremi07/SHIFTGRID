/**
 * The one list of security headers, used by next.config.ts (every response,
 * including static files) and proxy.ts (responses the proxy builds itself, such as
 * redirects and 429s). Change them here only.
 *
 * CSP notes
 *  - `script-src 'unsafe-inline'`: Next injects inline bootstrap/hydration scripts.
 *    A nonce would be stronger but forces every page to render dynamically, which
 *    would break the prerendered home page. `unsafe-eval` is allowed in development
 *    only (React refresh). Everything else is first-party.
 *  - `connect-src`: Supabase REST/Auth/Storage over https and Realtime over wss,
 *    PostHog (only if configured), OpenStreetMap Nominatim is called server-side.
 *  - Sentry (browser errors) is allowed in `connect-src` only when NEXT_PUBLIC_SENTRY_DSN is set.
 *  - `img-src`: Leaflet tiles (OpenStreetMap), Supabase Storage (signed documents),
 *    data:/blob: for inline SVG and QR codes.
 *  - Fonts come from `next/font/google`, which self-hosts them at build time.
 *  - Browser APIs: only geolocation (for "Nearest to me") is allowed, for our own origin.
 */

function origin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function buildCsp(): string {
  const dev = process.env.NODE_ENV !== 'production'
  const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const supabaseWs = supabase ? supabase.replace(/^http/, 'ws') : null
  const posthog = process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST
    ? origin(process.env.NEXT_PUBLIC_POSTHOG_HOST)
    : null

  // PostHog Cloud serves its config/toolbar scripts from a sibling host: us.i.posthog.com -> us-assets.i.posthog.com.
  const posthogAssets = posthog ? posthog.replace(/^(https:\/\/[a-z0-9]+)\.i\.posthog\.com$/i, '$1-assets.i.posthog.com') : null

  const sentry = origin(process.env.NEXT_PUBLIC_SENTRY_DSN)

  const list = (...values: (string | null | false)[]) => values.filter(Boolean).join(' ')

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': list("'self'", "'unsafe-inline'", dev && "'unsafe-eval'", posthog, posthogAssets),
    'style-src': "'self' 'unsafe-inline'",
    'img-src': list("'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', supabase, 'https://*.supabase.co'),
    'font-src': "'self' data:",
    'connect-src': list("'self'", supabase, supabaseWs, 'https://*.supabase.co', 'wss://*.supabase.co', posthog, posthogAssets, sentry, dev && 'ws:'),
    'frame-src': "'none'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
    'worker-src': "'self' blob:",
    'manifest-src': "'self'",
  }
  if (!dev) directives['upgrade-insecure-requests'] = ''

  return Object.entries(directives)
    .map(([name, value]) => (value ? `${name} ${value}` : name))
    .join('; ')
}

export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: buildCsp() },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
}

export function securityHeaderRecord(): Record<string, string> {
  return Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]))
}
