#!/usr/bin/env node
/**
 * Browser checks for the analytics consent gate and session-recording privacy.
 * PostHog's servers are mocked (nothing leaves the machine except the real recorder script
 * from PostHog's CDN), so fake keys are fine:
 *
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_test NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com npm run build
 *   npx next start -p 3112
 *   BASE_URL=http://localhost:3112 node scripts/verify-consent.mjs
 *   then rebuild WITHOUT the fake keys (NEXT_PUBLIC_* values are baked into the build).
 *
 * posthog-js drops events from automation, so the browser uses a normal user agent and hides
 * navigator.webdriver. Snapshots only flush once the page sees activity, hence the mouse wiggles.
 * Browser: PLAYWRIGHT_CHROMIUM_PATH, else the newest Chromium in the Playwright cache, else Playwright's.
 * Exit 1 on any failure.
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const BASE = (process.env.BASE_URL || 'http://localhost:3112').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SECRET = 'deadbeef'.repeat(6)
const REMOTE_CONFIG = { sessionRecording: { endpoint: '/s/', recorderVersion: 'v2' }, supportedCompression: ['base64'], hasFeatureFlags: false }

function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!existsSync(cache)) return undefined
  for (const build of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const exe = join(cache, build, 'chrome-win64', 'chrome.exe')
    if (existsSync(exe)) return exe
  }
  return undefined
}

let failures = 0
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra && !cond ? `  (${extra})` : ''}`)
  if (!cond) failures++
}

try {
  const res = await fetch(BASE + '/')
  if (!/posthog/i.test(await res.text()) && !process.env.SKIP_CONFIG_CHECK) {
    // The key is inlined only in client chunks, so this is a soft hint, not a failure.
    console.log('note: start a build made WITH NEXT_PUBLIC_POSTHOG_KEY/_HOST, or the banner never appears')
  }
} catch {
  console.error(`Cannot reach ${BASE}. Build with fake PostHog keys and start it first (see the header).`)
  process.exit(1)
}

const browser = await chromium.launch({ executablePath: chromiumPath() })

/** A fresh visitor. `consent` pre-seeds a stored choice; `bodies` collects snapshot uploads. */
async function visitor({ consent } = {}) {
  const context = await browser.newContext({ userAgent: UA })
  await context.addInitScript((c) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    if (c) localStorage.setItem('sg-consent', JSON.stringify({ v: 1, ...c, at: new Date().toISOString() }))
  }, consent ?? null)
  const log = { ph: [], snaps: [], errors: [] }
  context.on('request', (r) => {
    if (/posthog/.test(r.url())) log.ph.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  context.on('response', (r) => {
    // The fake Sentry DSN is rejected by Sentry (400); /forgot-password is a known missing page.
    if (r.status() >= 400 && !r.url().includes('ingest.sentry.io') && !r.url().includes('/forgot-password')) {
      log.errors.push(`${r.status()} ${r.url().slice(0, 100)}`)
    }
  })
  await context.route(/posthog\.com/, (route) => {
    const req = route.request()
    const url = req.url()
    if (/lazy-recorder|surveys/.test(url)) return route.continue()
    if (req.method() === 'POST' && new URL(url).pathname === '/s/') log.snaps.push({ at: Date.now(), text: decode(req.postDataBuffer()) })
    if (/config\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REMOTE_CONFIG) })
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if ((m.type() === 'error' && !/Failed to load resource/.test(t)) || /Content Security|hydrat/i.test(t)) log.errors.push(t.slice(0, 140))
  })
  page.on('pageerror', (e) => log.errors.push(`pageerror ${e.message.slice(0, 140)}`))
  const wiggle = async (rounds, until) => {
    for (let i = 0; i < rounds && !(until && until()); i++) {
      await page.mouse.move(80 + i * 25, 120 + i * 15)
      await page.mouse.wheel(0, i % 2 ? -200 : 200)
      await page.waitForTimeout(1500)
    }
  }
  return { context, page, log, wiggle }
}

function decode(buf) {
  if (!buf) return ''
  let t = buf.toString('utf8')
  const m = t.match(/^data=(.*)$/s)
  if (m) t = decodeURIComponent(m[1])
  try {
    const d = Buffer.from(t, 'base64').toString('utf8')
    if (d.startsWith('[') || d.startsWith('{')) t = d
  } catch {
    /* not base64 */
  }
  return t
}

const phStorage = (page) =>
  page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage), ...document.cookie.split(';').map((s) => s.split('=')[0].trim())].filter((k) =>
      /^(ph_|__ph)/.test(k)
    )
  )
const banner = (page) => page.getByRole('region', { name: 'Privacy choices' })
const sentEvents = (log) => log.ph.some((x) => /^POST \/(e|i\/v0\/e)\//.test(x))

/* 1. No choice yet, then Reject */
{
  const { context, page, log } = await visitor()
  await page.goto(BASE + '/', { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  ok(await banner(page).isVisible(), 'banner shown on first visit')
  ok(log.ph.length === 0, 'no PostHog request before a choice', log.ph.join(', '))
  ok((await phStorage(page)).length === 0, 'no ph_ storage or cookies before a choice')
  await banner(page).getByRole('button', { name: 'Reject all' }).click()
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2500)
  ok(!(await banner(page).isVisible()), 'Reject all is remembered across reloads')
  ok(log.ph.length === 0, 'no PostHog request after rejecting', log.ph.join(', '))
  ok(log.errors.length === 0, 'no console, CSP or hydration errors (reject)', log.errors.join(' | '))
  await context.close()
}

/* 2. Analytics only */
{
  const { context, page, log } = await visitor()
  await page.goto(BASE + '/courts', { waitUntil: 'load' })
  await banner(page).getByRole('button', { name: 'Customize' }).click()
  ok(!(await page.locator('#consent-replay').isEnabled()), 'recordings cannot be ticked without analytics')
  await page.locator('#consent-analytics').check()
  await page.getByRole('button', { name: 'Save choices' }).click()
  await page.waitForTimeout(5000)
  ok(sentEvents(log), 'analytics only: pageview sent', log.ph.join(', '))
  ok(!log.ph.some((x) => /recorder|^POST \/s\//.test(x)), 'analytics only: nothing recorded')
  await context.close()
}

/* 3. Accept all: recording, masking, secret URLs, excluded pages, revoke */
{
  const { context, page, log, wiggle } = await visitor()
  await page.goto(`${BASE}/courts?token=${SECRET}#${SECRET}`, { waitUntil: 'load' })
  await banner(page).getByRole('button', { name: 'Accept all' }).click()
  await wiggle(14, () => log.snaps.length > 0)
  ok(log.snaps.length > 0, 'accept all: snapshots recorded on /courts')
  const recorded = log.snaps.map((s) => s.text).join('\n')
  ok(!recorded.includes(SECRET) && !log.ph.join().includes(SECRET), 'secret ?token= and #fragment never reach PostHog')
  const heading = (await page.locator('h1').first().innerText()).trim()
  ok(heading.length > 3 && !recorded.includes(heading), `page text is masked in recordings ("${heading}" absent)`)

  // Full load of an excluded page: counted, not recorded.
  log.ph.length = 0
  await page.goto(BASE + '/login', { waitUntil: 'load' })
  await page.waitForTimeout(6000)
  ok(sentEvents(log), 'excluded page still counts a pageview', log.ph.join(', '))
  ok(!log.ph.some((x) => /^POST \/s\//.test(x)), 'excluded page (full load): nothing recorded')

  // Revoke from "Cookie settings".
  await page.goto(BASE + '/privacy', { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  ok((await phStorage(page)).length > 0, 'PostHog storage exists while consented')
  await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reject all' }).click()
  await page.waitForTimeout(1500)
  ok((await phStorage(page)).length === 0, 'revoking deletes ph_ storage and cookies', (await phStorage(page)).join(', '))
  log.ph.length = 0
  await page.goto(BASE + '/courts', { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  ok(log.ph.length === 0, 'after revoking: no PostHog request', log.ph.join(', '))
  ok(log.errors.length === 0, 'no console, CSP or hydration errors (accept / revoke)', log.errors.join(' | '))
  await context.close()
}

/* 4. Client-side navigation into an excluded page is stopped before it renders */
{
  const { context, page, log, wiggle } = await visitor({ consent: { analytics: true, replay: true } })
  await page.goto(BASE + '/', { waitUntil: 'load' })
  await wiggle(10, () => log.snaps.length > 0)
  ok(log.snaps.length > 0, 'recording on / before navigating')
  await page.getByRole('link', { name: 'Login' }).first().click()
  await page.waitForURL(/\/login/)
  const navAt = Date.now()
  await wiggle(8)
  const after = log.snaps.filter((s) => s.at > navAt)
  ok(!after.some((s) => s.text.includes('/login')), `nothing recorded for /login after a client-side move (${after.length} late flush(es) of earlier data)`)
  const before = log.snaps.length
  await page.goBack()
  await page.waitForURL((u) => new URL(u).pathname === '/')
  await wiggle(10, () => log.snaps.length > before)
  ok(log.snaps.length > before, 'recording resumes after going back to an allowed page')
  await context.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll consent checks passed')
process.exit(failures ? 1 : 0)
