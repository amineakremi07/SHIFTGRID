#!/usr/bin/env node
/**
 * Verifies that the hosted Supabase project's Auth allow-list contains every redirect URL ShiftGrid needs,
 * WITHOUT a management token or login: Supabase's /auth/v1/verify endpoint redirects to `redirect_to` only
 * when that URL is on the allow-list, and otherwise to the project's Site URL. We call it with a bogus
 * token and read the Location header, so the answer is the project's real behaviour, not a config file.
 *
 *   npm run verify:auth-urls                      uses NEXT_PUBLIC_APP_URL from .env.local
 *   node scripts/verify-auth-redirects.mjs --app-url https://shiftgridtn.vercel.app
 *
 * If it fails: `supabase config diff` (must list only auth.site_url and auth.additional_redirect_urls), then
 * `supabase config push`, or add the URLs in the dashboard (Authentication > URL Configuration). Exit 1 on failure.
 */
import { readFileSync } from 'node:fs'

const env = { ...process.env }
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  /* variables may be exported instead */
}

const argIndex = process.argv.indexOf('--app-url')
const appUrl = (argIndex > 0 ? process.argv[argIndex + 1] : env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (!supabaseUrl || !/^https:\/\//.test(supabaseUrl)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL (an https URL) is required in .env.local.')
  process.exit(1)
}
if (!/^https?:\/\/[^/]+$/.test(appUrl)) {
  console.error('An app origin is required: set NEXT_PUBLIC_APP_URL or pass --app-url https://your-site.example')
  process.exit(1)
}

// Mirrors lib/auth-urls.ts (tests/auth-urls.spec.ts keeps the two identical).
const PATHS = ['/auth/callback', '/accept-invitation', '/reset-password']
const LOCAL_ORIGIN = 'http://localhost:3000'
const required = [...new Set([appUrl, LOCAL_ORIGIN])].flatMap((origin) => PATHS.map((p) => `${origin}${p}`))

let failures = 0
const check = (ok, name, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`)
}

/** Where Supabase sends the browser for this redirect_to (the Location header, minus the #error fragment). */
async function landing(redirectTo) {
  const res = await fetch(`${supabaseUrl}/auth/v1/verify?token=shiftgrid-probe-invalid&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`, {
    redirect: 'manual',
  })
  const location = res.headers.get('location')
  return location ? location.split('#')[0] : `(no redirect, HTTP ${res.status})`
}

console.log(`Project ${supabaseUrl}\nApp origin ${appUrl}\n`)

let siteUrl = null
for (const url of required) {
  const where = await landing(url)
  const allowed = where === url || where.startsWith(`${url}?`)
  if (!allowed) siteUrl = siteUrl ?? where
  check(allowed, `redirect allowed: ${url}`, `Supabase sent the browser to ${where} instead (not on the allow-list)`)
}

// Negative control: an unrelated URL must NOT be allowed (an over-broad pattern such as ** would be a hole).
const evil = 'https://evil.example/auth/callback'
const evilWhere = await landing(evil)
check(evilWhere !== evil, 'a foreign URL is NOT allowed (the allow-list is not a wildcard)', `Supabase redirected to ${evil}`)

// Where the project falls back to: the Site URL, which also fills {{ .SiteURL }} in email templates.
const site = siteUrl ?? evilWhere
if (/^https?:\/\//.test(site)) {
  const siteOrigin = new URL(site).origin
  check(siteOrigin === appUrl, `Site URL is the app origin (${siteOrigin})`, `it is ${siteOrigin}; set Site URL to ${appUrl} (supabase/config.toml auth.site_url, then supabase config push)`)
}

console.log(failures ? `\n${failures} check(s) FAILED. Fix: supabase config diff, then supabase config push (see the header of supabase/config.toml).` : '\nAll auth redirect URLs are configured.')
process.exit(failures ? 1 : 0)
