#!/usr/bin/env node
/**
 * HTTP checks for the security headers and the proxy rate limits, against a running
 * server (production build recommended: `npm run build && npx next start -p 3111`).
 *
 *   BASE_URL=http://localhost:3111 node scripts/test-rate-limit.mjs
 *
 * Each run uses a random X-Forwarded-For address, so earlier runs (or other
 * traffic from this machine) do not share its counters, and it can be re-run at
 * once. Works against both backends: in-memory (no Upstash env) and Upstash.
 * Exits 1 on any failure, or if the server is unreachable.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3111'
const ip = () => `10.${rnd()}.${rnd()}.${rnd()}`
const rnd = () => Math.floor(Math.random() * 250) + 1

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

/** Fire `n` sequential requests from one IP; return the responses. */
async function burst(path, n, { ip: addr = ip(), method = 'GET', headers = {} } = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(await fetch(BASE + path, { method, headers: { 'x-forwarded-for': addr, ...headers }, redirect: 'manual' }))
  }
  return out
}

try {
  await fetch(BASE + '/manifest.json')
} catch {
  console.error(`Cannot reach ${BASE}. Start the app first (npm run build && npx next start -p 3111).`)
  process.exit(1)
}

// ---- security headers on a normal page -----------------------------------------------
{
  const res = await fetch(BASE + '/login', { headers: { 'x-forwarded-for': ip() } })
  const h = (k) => res.headers.get(k) ?? ''
  const csp = h('content-security-policy')
  check(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), 'CSP is set (default-src self, frame-ancestors none, object-src none)')
  check(/connect-src[^;]*supabase\.co/.test(csp) && /connect-src[^;]*wss:\/\//.test(csp), 'CSP allows Supabase https + wss connections')
  check(!/script-src[^;]*unsafe-eval/.test(csp) || process.env.EXPECT_DEV === '1', "CSP script-src has no 'unsafe-eval' in production")
  check(h('strict-transport-security') === 'max-age=63072000; includeSubDomains; preload', 'HSTS 2 years, includeSubDomains, preload')
  check(h('x-frame-options') === 'DENY', 'X-Frame-Options: DENY')
  check(h('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff')
  check(h('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy: strict-origin-when-cross-origin')
  const pp = h('permissions-policy')
  check(pp.includes('camera=()') && pp.includes('microphone=()') && pp.includes('geolocation=(self)'), 'Permissions-Policy blocks camera/microphone, geolocation self only', pp)
}

// ---- /api/auth/*: 5 per minute per IP -------------------------------------------------
{
  const addr = ip()
  const rs = await burst('/api/auth/login', 7, { ip: addr, method: 'POST' })
  const statuses = rs.map((r) => r.status)
  check(statuses.slice(0, 5).every((s) => s !== 429), 'auth: first 5 requests are not rate limited', statuses.slice(0, 5).join(','))
  check(statuses[5] === 429 && statuses[6] === 429, 'auth: 6th and 7th request from the same IP get 429', statuses.join(','))
  const retry = Number(rs[5].headers.get('retry-after'))
  check(Number.isInteger(retry) && retry >= 1 && retry <= 60, 'auth: 429 carries Retry-After (1-60 s)', String(retry))
  const body = await rs[5].json().catch(() => null)
  check(Boolean(body?.error), '429 body is JSON with an error message')
  check(rs[5].headers.get('x-frame-options') === 'DENY', '429 responses still carry the security headers')
  const other = await burst('/api/auth/login', 1, { method: 'POST' })
  check(other[0].status !== 429, 'auth: a different IP is not affected', String(other[0].status))
}

// ---- cron: rate limited before the secret is even checked ------------------------------
{
  const addr = ip()
  const rs = await burst('/api/cron/notifications', 12, { ip: addr, headers: { authorization: 'Bearer definitely-wrong-secret' } })
  const statuses = rs.map((r) => r.status)
  check(statuses.slice(0, 10).every((s) => s === 401 || s === 503), 'cron: wrong or missing secret is refused (401/503), never 200', [...new Set(statuses.slice(0, 10))].join(','))
  check(statuses[10] === 429 && statuses[11] === 429, 'cron: 11th request in a minute gets 429, so the secret cannot be guessed quickly', statuses.slice(8).join(','))
  check(Number(rs[10].headers.get('retry-after')) >= 1, 'cron: 429 has Retry-After')
}

// ---- general API: 60 per minute per path -----------------------------------------------
{
  const addr = ip()
  const rs = await burst('/api/v1/courts', 62, { ip: addr })
  const statuses = rs.map((r) => r.status)
  const first429 = statuses.indexOf(429)
  check(first429 === 60, 'api: the 61st request to one path gets 429', `first 429 at #${first429 + 1}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
