#!/usr/bin/env node
/**
 * Launch readiness check for ShiftGrid. Read-only: it changes nothing.
 *
 *   node scripts/verify-launch-readiness.mjs [--env-file .env.production.local] [--url https://shiftgrid.tn]
 *                                            [--full] [--skip-live] [--skip-data] [--strict]
 *
 * Run it against the PRODUCTION configuration, e.g.
 *   vercel env pull .env.production.local --environment=production
 *   npm run build && npx next start -p 3111 &
 *   node scripts/verify-launch-readiness.mjs --env-file .env.production.local --url http://localhost:3111 --full
 * or, after deploying, with --url <the deployed origin>.
 *
 * Sections
 *   1. Environment   : production guards (no dry-run, no sandbox payments, limiter on), real secrets, legal identity.
 *   2. Source        : no hardcoded secrets / dev credentials in tracked or unignored files, no tracked .env files.
 *   3. Data          : the production database holds no test accounts/clubs/load-test rows (needs the service key).
 *   4. Live          : security headers, legal pages, manifest, on a running server (--url, default http://localhost:3111).
 *   5. Build         : a production build exists and is newer than the source; --full also runs tsc and lint.
 *   6. Manual        : things no script can check (printed; they fail only with --strict).
 *
 * Exit code 1 on any FAIL. WARN means "decide on purpose"; MANUAL is a reminder.
 * Without --env-file the process environment is used (as in CI); `.env.local` is never read implicitly because it
 * holds development values.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)

const results = []
const rec = (level, section, label, detail = '') => {
  results.push({ level, section, label, detail })
  const tag = { PASS: 'PASS  ', FAIL: 'FAIL  ', WARN: 'WARN  ', MANUAL: 'MANUAL', SKIP: 'SKIP  ' }[level]
  console.log(`${tag} ${label}${detail ? `  (${detail})` : ''}`)
}
const pass = (s, l, d) => rec('PASS', s, l, d)
const fail = (s, l, d) => rec('FAIL', s, l, d)
const warn = (s, l, d) => rec('WARN', s, l, d)
const check = (s, ok, label, detail) => (ok ? pass(s, label) : fail(s, label, detail))
const heading = (t) => console.log(`\n== ${t} ==`)

/* ------------------------------------------------------------------ 1. environment */
heading('1. Environment')

function loadEnv() {
  const env = { ...process.env }
  const file = opt('--env-file')
  if (file) {
    if (!existsSync(file)) {
      fail('env', `env file ${file} exists`, 'pass the file produced by `vercel env pull`')
      return env
    }
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    pass('env', `loaded ${file}`)
  } else {
    warn('env', 'no --env-file: checking the process environment only')
  }
  return env
}
const env = loadEnv()
const val = (k) => (env[k] ?? '').trim()
const isLocalUrl = (u) => /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|host\.docker\.internal|192\.168\.)/i.test(u)

{
  const S = 'env'
  const url = val('NEXT_PUBLIC_SUPABASE_URL')
  check(S, /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || (url.startsWith('https://') && !isLocalUrl(url)), 'NEXT_PUBLIC_SUPABASE_URL is a remote https URL', url || 'unset')
  check(S, val('NEXT_PUBLIC_SUPABASE_ANON_KEY').length > 20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is set')

  const sr = val('SUPABASE_SERVICE_ROLE_KEY')
  let srProblem = null
  if (!sr) srProblem = 'unset'
  else if (sr === val('NEXT_PUBLIC_SUPABASE_ANON_KEY') || sr.startsWith('sb_publishable_')) srProblem = 'holds the publishable/anon key'
  else if (sr.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(sr.split('.')[1], 'base64url').toString()).role
      if (role !== 'service_role') srProblem = `JWT role is "${role}"`
    } catch {
      srProblem = 'is not a readable JWT'
    }
  } else if (!sr.startsWith('sb_secret_')) srProblem = 'is neither an sb_secret_ key nor a service_role JWT'
  check(S, !srProblem, 'SUPABASE_SERVICE_ROLE_KEY is a real secret key', srProblem)

  const app = val('NEXT_PUBLIC_APP_URL')
  check(S, app.startsWith('https://') && !isLocalUrl(app), 'NEXT_PUBLIC_APP_URL is the public https origin', app || 'unset')

  const smtpHost = val('SMTP_HOST')
  // Test inboxes accept mail but never deliver it (Mailtrap's live sending host is fine).
  const testInbox = /localhost|127\.0\.0\.1|sandbox\.smtp\.mailtrap|^smtp\.mailtrap\.io$|mailhog|mailpit|ethereal/i
  check(S, !!smtpHost && !testInbox.test(smtpHost), 'SMTP_HOST is a real mail server', smtpHost ? `${smtpHost} is a local or test inbox` : 'unset: no email is sent')
  const smtpPort = val('SMTP_PORT')
  check(S, !smtpPort || /^\d+$/.test(smtpPort), 'SMTP_PORT is a number (default 587)', smtpPort)
  check(S, !!val('SMTP_USER') && !!val('SMTP_PASS'), 'SMTP_USER and SMTP_PASS are set', 'missing: most providers refuse unauthenticated mail')
  check(S, val('EMAIL_DRY_RUN') !== '1', 'EMAIL_DRY_RUN is off (emails really send)', 'EMAIL_DRY_RUN=1')
  const from = val('EMAIL_FROM')
  check(S, !!from && !/example\.|localhost|\.local\b/i.test(from), 'EMAIL_FROM is set to a verified sender', from || 'unset (default noreply@shiftgrid.tn needs a verified domain)')

  const cron = val('CRON_SECRET')
  check(S, cron.length >= 16, 'CRON_SECRET is set (16+ chars)', cron ? `${cron.length} chars` : 'unset: /api/cron/notifications answers 503')
  if (cron && cron.length < 32) warn(S, 'CRON_SECRET is shorter than 32 chars', `${cron.length}`)

  check(S, val('PAYMENTS_TEST_MODE') !== '1', 'PAYMENTS_TEST_MODE is off (no fake "paid" payments)', 'PAYMENTS_TEST_MODE=1 records payments without moving money')
  check(S, val('RATE_LIMIT_DISABLED') !== '1', 'RATE_LIMIT_DISABLED is off', 'RATE_LIMIT_DISABLED=1')
  const up = val('UPSTASH_REDIS_REST_URL') && val('UPSTASH_REDIS_REST_TOKEN')
  check(S, !!up, 'Upstash Redis configured (shared rate limiter)', 'unset: each serverless instance would count separately')

  if (val('NEXT_PUBLIC_SENTRY_DSN') || val('SENTRY_DSN')) pass(S, 'Sentry DSN set')
  else warn(S, 'no Sentry DSN: production errors will not be reported')
  if (val('SENTRY_AUTH_TOKEN') && val('SENTRY_ORG') && val('SENTRY_PROJECT')) pass(S, 'Sentry source-map upload configured (token, org, project)')
  else warn(S, 'Sentry upload vars missing: no release/commits in Sentry and browser stack traces stay minified', 'set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT at build time')
  const phKey = val('NEXT_PUBLIC_POSTHOG_KEY')
  const phHost = val('NEXT_PUBLIC_POSTHOG_HOST')
  if (phKey || phHost) {
    check(S, !!phKey && !!phHost, 'PostHog has both NEXT_PUBLIC_POSTHOG_KEY and _HOST', 'one is missing: analytics stays off')
    check(S, existsSync('components/consent/consent-banner.tsx') && existsSync('lib/consent.ts'), 'PostHog runs behind the consent gate')
  } else pass(S, 'PostHog off (no analytics consent needed)')

  check(S, !!val('NEXT_PUBLIC_LEGAL_ENTITY') && val('NEXT_PUBLIC_LEGAL_ENTITY') !== 'ShiftGrid', 'NEXT_PUBLIC_LEGAL_ENTITY names the operating company', 'unset: /terms and /privacy show "ShiftGrid" with no company')
  check(S, !!val('NEXT_PUBLIC_LEGAL_ENTITY_DETAILS'), 'NEXT_PUBLIC_LEGAL_ENTITY_DETAILS (address / registry no.) set', 'unset')
  check(S, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(val('NEXT_PUBLIC_LEGAL_EMAIL')), 'NEXT_PUBLIC_LEGAL_EMAIL is a monitored privacy mailbox', 'unset: falls back to privacy@shiftgrid.tn, which must exist')
}

/* ------------------------------------------------------------------ 2. source */
heading('2. Source: secrets and development leftovers')
{
  const S = 'source'
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(f) && !/\.(png|jpe?g|gif|ico|webp|svg|woff2?|ttf|pdf|zip)$/i.test(f))

  const envTracked = files.filter((f) => /(^|\/)\.env(\..+)?$/.test(f) && !/\.example$/.test(f))
  check(S, envTracked.length === 0, 'no .env files are tracked or unignored', envTracked.join(', '))

  const isDevArea = (f) => /^(scripts|tests|supabase|\.playwright-mcp|\.claude)\//.test(f) || /\.(md|example)$/.test(f) || /\.example$/.test(f)
  const SECRET_PATTERNS = [
    ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/],
    ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{24,}\b/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['Postgres URL with password', /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{4,}@/],
  ]
  const JWT = /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g
  const hits = []
  const jwtHits = []
  const devLeftovers = []
  for (const f of files) {
    let text
    try {
      if (statSync(f).size > 1.5 * 1024 * 1024) continue
      text = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (/\.example$/.test(f)) continue
    for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${f}: ${name}`)
    for (const m of text.match(JWT) ?? []) {
      try {
        const role = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString()).role
        if (role === 'service_role') jwtHits.push(`${f}: service_role JWT`)
      } catch {
        /* not a JWT */
      }
    }
    if (!isDevArea(f)) {
      if (/ShiftGrid-Dev-1!/.test(text)) devLeftovers.push(`${f}: dev seed password`)
      if (/@shiftgrid\.local/.test(text)) devLeftovers.push(`${f}: @shiftgrid.local test account`)
      if (/\bEMAIL_DRY_RUN\s*[:=]\s*['"]?1/.test(text) && !/process\.env|env\./.test(text)) devLeftovers.push(`${f}: hard-coded EMAIL_DRY_RUN=1`)
    }
  }
  check(S, hits.length === 0 && jwtHits.length === 0, 'no API keys or service-role JWTs in source', [...hits, ...jwtHits].slice(0, 5).join('; '))
  check(S, devLeftovers.length === 0, 'no dev credentials or test accounts in app code', devLeftovers.slice(0, 5).join('; '))

  const unusedKey = files.filter((f) => /^(app|lib|components|hooks)\//.test(f) && /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/.test(readFileSafe(f)))
  check(S, unusedKey.length === 0, 'no NEXT_PUBLIC_ variable carries a secret', unusedKey.join(', '))

  // Cron: nothing schedules the reminder endpoint unless a config says so.
  const hasCron = ['vercel.json', 'vercel.ts'].some((f) => existsSync(f) && /crons/.test(readFileSafe(f)))
  if (hasCron) pass(S, 'a cron schedule is configured for /api/cron/notifications')
  else warn(S, 'no cron schedule found (vercel.json/vercel.ts): 2-hour reminders and retries never run', 'Vercel Pro cron, pg_cron, or an external scheduler')

  for (const f of ['app/terms/page.tsx', 'app/privacy/page.tsx']) check(S, existsSync(f), `${f} exists`)
}
function readFileSafe(f) {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ 3. data */
heading('3. Data: test accounts in the target database')
if (flag('--skip-data')) {
  rec('SKIP', 'data', 'skipped (--skip-data)')
} else {
  const S = 'data'
  const url = val('NEXT_PUBLIC_SUPABASE_URL')
  const key = val('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key || key.startsWith('sb_publishable_') || key === val('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
    fail(S, 'cannot inspect the database', 'needs NEXT_PUBLIC_SUPABASE_URL and a real SUPABASE_SERVICE_ROLE_KEY')
  } else {
    try {
      const db = createClient(url, key, { auth: { persistSession: false } })
      const users = []
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw new Error(error.message)
        users.push(...data.users)
        if (data.users.length < 1000) break
      }
      const test = users.filter((u) => /@shiftgrid\.local$|@example\.(com|org)$/i.test(u.email ?? '') || /^e2e[.\s]/i.test(u.email ?? ''))
      check(S, test.length === 0, 'no @shiftgrid.local / example.* / e2e accounts in auth.users', `${test.length} found, e.g. ${test.slice(0, 3).map((u) => u.email).join(', ')}`)

      const { data: orgs, error: oErr } = await db.from('organizations').select('id, name, status')
      if (oErr) throw new Error(oErr.message)
      const testOrgs = orgs.filter((o) => /test club|rls probe|e2e|k6|load bench/i.test(o.name))
      check(S, testOrgs.length === 0, 'no test clubs in organizations', testOrgs.map((o) => `${o.name} [${o.status}]`).join(', '))

      const { count } = await db.from('anonymous_bookers').select('id', { count: 'exact', head: true }).or('name.like.K6 LOAD%,name.like.LOAD BENCH%,name.like.E2E %')
      check(S, !count, 'no load-test / e2e guest bookers', `${count} found; run npm run cleanup:load`)

      const { data: admins } = await db.from('profiles').select('id').eq('role', 'platform_admin').limit(1)
      check(S, !!admins?.length, 'at least one platform_admin exists to verify clubs', 'run scripts/seed-platform-admin.mjs with a real address')
    } catch (e) {
      fail(S, 'database inspection failed', e instanceof Error ? e.message : String(e))
    }
  }
}

/* ------------------------------------------------------------------ 4. live */
heading('4. Live: security headers and public pages')
if (flag('--skip-live')) {
  rec('SKIP', 'live', 'skipped (--skip-live)')
} else {
  const S = 'live'
  const base = (opt('--url') || 'http://localhost:3111').replace(/\/$/, '')
  const remote = !isLocalUrl(base)
  try {
    const res = await fetch(base + '/', { redirect: 'manual' })
    const h = (n) => res.headers.get(n) ?? ''
    check(S, res.status === 200, `GET ${base}/ answers 200`, String(res.status))
    const csp = h('content-security-policy')
    check(S, /default-src 'self'/.test(csp), 'CSP has default-src \'self\'', csp ? 'weak or missing default-src' : 'missing')
    check(S, /frame-ancestors 'none'/.test(csp), 'CSP forbids framing (frame-ancestors \'none\')')
    check(S, /object-src 'none'/.test(csp), 'CSP object-src \'none\'')
    check(S, /upgrade-insecure-requests/.test(csp), 'CSP upgrades insecure requests', 'only present in production builds')
    check(S, !/unsafe-eval/.test(csp), 'CSP has no unsafe-eval', 'dev server?')
    if (/script-src[^;]*'unsafe-inline'/.test(csp)) warn(S, "CSP script-src allows 'unsafe-inline' (known trade-off: nonces would make every page dynamic)")
    const hsts = h('strict-transport-security')
    const maxAge = Number((hsts.match(/max-age=(\d+)/) ?? [])[1] ?? 0)
    check(S, maxAge >= 31536000, 'HSTS max-age >= 1 year', hsts || 'missing')
    check(S, h('x-frame-options').toUpperCase() === 'DENY', 'X-Frame-Options: DENY', h('x-frame-options') || 'missing')
    check(S, h('x-content-type-options').toLowerCase() === 'nosniff', 'X-Content-Type-Options: nosniff')
    check(S, !!h('referrer-policy'), 'Referrer-Policy set', h('referrer-policy') || 'missing')
    const pp = h('permissions-policy')
    check(S, /camera=\(\)/.test(pp) && /microphone=\(\)/.test(pp), 'Permissions-Policy turns camera and microphone off', pp || 'missing')
    check(S, !h('x-powered-by'), 'no X-Powered-By header')
    if (remote) check(S, base.startsWith('https://'), 'public origin is https', base)

    for (const p of ['/terms', '/privacy', '/manifest.json', '/courts', '/login', '/register']) {
      const r = await fetch(base + p, { redirect: 'manual' })
      check(S, r.status === 200, `GET ${p} answers 200`, String(r.status))
    }
    for (const p of ['/dashboard/org', '/admin/verification']) {
      const r = await fetch(base + p, { redirect: 'manual' })
      check(S, [301, 302, 303, 307, 308].includes(r.status) || (r.status === 200 && /NEXT_REDIRECT|login/i.test(await r.text())), `${p} is protected when signed out`, String(r.status))
    }
    const cron = await fetch(base + '/api/cron/notifications', { redirect: 'manual', headers: { 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.1.1` } })
    check(S, [401, 503].includes(cron.status), '/api/cron/notifications refuses without the secret', String(cron.status))
    const terms = await (await fetch(base + '/privacy')).text()
    check(S, /2004-63/.test(terms) && /INPDP/.test(terms), '/privacy cites Law 2004-63 and INPDP')
  } catch (e) {
    fail(S, `server reachable at ${base}`, `${e instanceof Error ? e.message : e}. Start it (npm run build && npx next start -p 3111), pass --url, or --skip-live`)
  }
}

/* ------------------------------------------------------------------ 5. build */
heading('5. Build')
{
  const S = 'build'
  const idFile = '.next/BUILD_ID'
  if (!existsSync(idFile)) {
    fail(S, 'a production build exists', 'run npm run build')
  } else {
    pass(S, 'a production build exists')
    const builtAt = statSync(idFile).mtimeMs
    const newest = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'app', 'components', 'lib', 'hooks', 'proxy.ts', 'next.config.ts', 'package.json'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => {
        try {
          return { f, t: statSync(f).mtimeMs }
        } catch {
          return { f, t: 0 }
        }
      })
      .sort((a, b) => b.t - a.t)[0]
    check(S, !newest || newest.t <= builtAt + 1000, 'build is newer than the source', newest ? `${newest.f} changed after the build` : '')
    // Anything under .next/static is served publicly: a leftover map would expose the source.
    const maps = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.map')) maps.push(p)
      }
    }
    if (existsSync('.next/static')) walk('.next/static')
    check(S, maps.length === 0, 'no source maps in the public .next/static output', `${maps.length} found, e.g. ${maps.slice(0, 2).join(', ')}`)
  }
  if (flag('--full')) {
    const run = (label, cmd, cmdArgs) => {
      const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', shell: process.platform === 'win32' })
      check(S, r.status === 0, label, (r.stdout + r.stderr).split('\n').filter(Boolean).slice(-4).join(' | '))
    }
    run('tsc --noEmit is clean', 'npx', ['tsc', '--noEmit'])
    run('eslint reports no errors', 'npm', ['run', '--silent', 'lint', '--', '--quiet'])
  } else {
    rec('SKIP', S, 'tsc / lint not run (add --full)')
  }
}

/* ------------------------------------------------------------------ 6. manual */
heading('6. Manual: cannot be checked by a script')
const MANUAL = [
  'Declare the processing to the INPDP (and obtain any authorisation needed for transfers abroad: Supabase/Vercel/email provider/Upstash servers) before collecting real personal data',
  'Have a Tunisian lawyer review /terms and /privacy; consider French and Arabic versions (the pages are English only)',
  'Create the privacy mailbox (NEXT_PUBLIC_LEGAL_EMAIL) and agree who answers access/deletion requests within 30 days',
  'Authorise the SMTP provider to send for the EMAIL_FROM domain (SPF/DKIM/DMARC) and send a real test email',
  'Supabase dashboard: enable leaked-password protection; confirm backups/PITR; align the 20261005000000 migration history row',
  'Connect a real payment gateway (ClickToPay/Stripe) or keep online payment off; pay-at-venue auto-release is NOT implemented (Terms say so)',
  'Schedule /api/cron/notifications every 5-15 min (Authorization: Bearer $CRON_SECRET)',
  'PostHog project settings: enable session replay only if wanted, set its sampling/minimum duration to fit the free tier; no self-service account deletion exists yet (handled by email)',
  'Sentry: connect the GitHub integration so releases list their commits; check the first production error shows a readable (source-mapped) stack trace',
  'Run npm run test:load against the deployed region and re-check booking p95; run npm run cleanup:load afterwards',
]
for (const m of MANUAL) rec('MANUAL', 'manual', m)

/* ------------------------------------------------------------------ summary */
const count = (l) => results.filter((r) => r.level === l).length
console.log(`\nSummary: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} warnings, ${count('SKIP')} skipped, ${count('MANUAL')} manual items`)
const strictFail = flag('--strict') && count('MANUAL') > 0
if (count('FAIL') > 0 || strictFail) {
  console.log('NOT READY TO LAUNCH')
  process.exit(1)
}
console.log('Automated checks passed. Work through the MANUAL items before launch.')
