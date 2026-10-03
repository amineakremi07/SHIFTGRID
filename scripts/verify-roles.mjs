#!/usr/bin/env node
/**
 * Check the four seeded accounts (scripts/seed-all-roles.mjs) end to end:
 *   1. each signs in with the public (anon) key and its profile has the right role;
 *   2. none can change its own role / club, and an owner cannot promote staff;
 *   3. with a dev server running (BASE_URL, default http://localhost:3000), each
 *      account's session cookie is sent to the role pages and the response
 *      (status / redirect target) is compared with what that role should see.
 *
 *   node scripts/verify-roles.mjs
 *
 * Exits 1 on any failure. Needs NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY (only to restore a value if a check ever finds a hole).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return env
}
const env = loadEnv()
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PASSWORD = env.SEED_PASSWORD || 'ShiftGrid-Dev-1!'
const BASE = env.BASE_URL || 'http://localhost:3000'
const REF = new globalThis.URL(URL_).hostname.split('.')[0]

const ACCOUNTS = [
  { email: 'admin@shiftgrid.local', role: 'platform_admin' },
  { email: 'owner@shiftgrid.local', role: 'org_admin' },
  { email: 'staff@shiftgrid.local', role: 'staff' },
  { email: 'player@shiftgrid.local', role: 'player' },
]

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const fresh = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

/** The cookie @supabase/ssr reads: base64url JSON of the session, chunked at 3180 chars. */
function sessionCookie(session) {
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const name = `sb-${REF}-auth-token`
  if (value.length <= 3180) return `${name}=${value}`
  const parts = value.match(/.{1,3180}/g)
  return parts.map((p, i) => `${name}.${i}=${p}`).join('; ')
}

/**
 * Status and redirect target. A redirect is either an HTTP 307 (the proxy, a layout)
 * or, once a route's loading.tsx has started streaming, a 200 whose body carries a
 * meta refresh (a page's redirect() inside the loading boundary). Both send the
 * visitor away before any page data is rendered; `soft` tells them apart.
 */
async function probe(path, cookie) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' })
  const loc = res.headers.get('location')
  if (loc) return { status: res.status, to: new globalThis.URL(loc, BASE).pathname, soft: false }
  const body = res.status === 200 ? await res.text() : ''
  const meta = body.match(/http-equiv="refresh"\s+content="\d+;url=([^"]+)"/)
  return { status: res.status, to: meta ? new globalThis.URL(meta[1], BASE).pathname : null, soft: Boolean(meta) }
}

// What each role should get from each page: a redirect target, or 200 = page renders.
const ROUTES = {
  platform_admin: { '/admin/verification': 200, '/dashboard/org/bookings': '/admin/verification' },
  org_admin: {
    '/dashboard/org/bookings': 200,
    '/dashboard/org/staff': 200,
    '/dashboard/org/analytics': 200,
    '/admin/verification': '/',
  },
  staff: {
    '/dashboard/org/bookings': 200,
    '/dashboard/org/staff': '/dashboard/org/bookings',
    '/dashboard/org/analytics': '/dashboard/org/bookings',
    '/dashboard/org/courts': '/dashboard/org/bookings',
    '/admin/verification': '/',
  },
  player: { '/': 200, '/reservations': 200, '/admin/verification': '/' },
}

async function main() {
  const sessions = {}
  const profiles = {}

  for (const a of ACCOUNTS) {
    const sb = fresh()
    const { data, error } = await sb.auth.signInWithPassword({ email: a.email, password: PASSWORD })
    if (error) {
      check(false, `${a.email} signs in`, error.message)
      continue
    }
    const { data: p } = await sb.from('profiles').select('id, role, org_id').eq('id', data.user.id).single()
    check(p?.role === a.role, `${a.email} has role ${a.role}`, `got ${p?.role}`)
    sessions[a.role] = { sb, session: data.session }
    profiles[a.role] = p
  }

  // --- Escalation: a client must never be able to change role or club.
  const hostile = { player: 'org_admin', staff: 'org_admin', org_admin: 'platform_admin' }
  for (const [role, target] of Object.entries(hostile)) {
    const s = sessions[role]
    if (!s) continue
    const own = profiles[role]
    await s.sb.from('profiles').update({ role: target }).eq('id', own.id)
    await s.sb.from('profiles').update({ org_id: profiles.platform_admin?.org_id }).eq('id', own.id)
    const { data: after } = await s.sb.from('profiles').select('role, org_id').eq('id', own.id).single()
    check(after?.role === own.role && after?.org_id === own.org_id, `${role} cannot change own role or club`, `role ${after?.role}`)
  }
  if (sessions.org_admin && profiles.staff) {
    await sessions.org_admin.sb.from('profiles').update({ role: 'org_admin' }).eq('id', profiles.staff.id)
    const { data: staffNow } = await fresh()
      .auth.signInWithPassword({ email: 'staff@shiftgrid.local', password: PASSWORD })
      .then(async ({ data }) => ({ data: (await createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY).from('profiles').select('role').eq('id', data.user.id).single()).data }))
    check(staffNow?.role === 'staff', 'org_admin cannot promote staff via the API', `staff is ${staffNow?.role}`)
  }

  // --- Routing, only if a dev server is up.
  let up = true
  try {
    await fetch(BASE + '/login-owner', { redirect: 'manual' })
  } catch {
    up = false
  }
  if (!up) {
    console.log(`SKIP  routing checks: no server at ${BASE} (run npm run dev)`)
  } else {
    for (const [role, routes] of Object.entries(ROUTES)) {
      const s = sessions[role]
      if (!s) continue
      const cookie = sessionCookie(s.session)
      for (const [path, expected] of Object.entries(routes)) {
        const r = await probe(path, cookie)
        const ok = expected === 200 ? r.status === 200 && !r.soft : r.to === expected
        check(ok, `${role}: ${path} ${expected === 200 ? 'renders' : `-> ${expected}`}`, `${r.status}${r.to ? ` -> ${r.to}${r.soft ? ' (streamed)' : ''}` : ''}`)
      }
    }
    // Both portals render for a signed-out visitor, with their own branding.
    for (const [path, text] of [['/login', 'Log in'], ['/login-owner', 'Club Management Login']]) {
      const res = await fetch(BASE + path, { redirect: 'manual' })
      const html = await res.text()
      check(res.status === 200 && html.includes(text), `signed out: ${path} renders "${text}"`, String(res.status))
    }
    // A signed-in visitor on either login page is sent to their role's landing page.
    const LANDING = { platform_admin: '/admin/verification', org_admin: '/dashboard/org', staff: '/dashboard/org/bookings', player: '/' }
    for (const [role, s] of Object.entries(sessions)) {
      for (const path of ['/login', '/login-owner']) {
        const r = await probe(path, sessionCookie(s.session))
        check(r.to === LANDING[role], `${role} on ${path} -> ${LANDING[role]}`, `${r.status} -> ${r.to}`)
      }
    }
    const anon = await probe('/dashboard/org/bookings', '')
    check(anon.to === '/login-owner', 'signed out: /dashboard/org/bookings -> /login-owner', `${anon.status} -> ${anon.to}`)
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('Verify failed:', e.message ?? e)
  process.exit(1)
})
