/**
 * k6 stress test for ShiftGrid: public reads, guest bookings under contention, rate limits.
 *
 *   npm run build && npx next start -p 3111
 *   BASE_URL=http://localhost:3111 k6 run scripts/k6-booking-stress.js
 *   (or: npm run test:load; no local k6? see "Load testing" in CLAUDE.md for the Docker form)
 *
 * What it drives
 *  - reads      : GET /courts, /courts/<orgId> (public, anonymous).
 *  - booking    : the real `createBooking` Server Action, as a guest, cash. Every VU sends its
 *                 own X-Forwarded-For so each gets its own 10/min booking allowance (as real
 *                 players on different networks would). Slots are spread over days 2-58 and
 *                 both courts, so these are real, distinct bookings. Every 5th attempt goes
 *                 for ONE shared "hot" slot: exactly one of them may win, the rest must be
 *                 `slot_taken`, and none may be a 500 / `unknown` (that would be a DB error).
 *  - burst      : one IP hammers /api/v1/courts (60/min rule -> HTTP 429 + Retry-After) and the
 *                 booking action (10/min rule -> `rate_limited`).
 *
 * About "pooling on port 6543": ShiftGrid has no Postgres driver. Every query is supabase-js over
 * HTTPS to PostgREST, which Supabase already pools. This test therefore measures the thing that
 * would break under pooling pressure: errors/timeouts from Supabase while 50 users write at once.
 *
 * Env
 *  BASE_URL      default http://localhost:3000
 *  ORG_ID        club to book at (default: the seeded "ShiftGrid Test Club")
 *  COURT_IDS     comma list (default: that club's padel + tennis court)
 *  ACTION_ID     the createBooking Server Action id. Default: read from
 *                .next/server/server-reference-manifest.json (needs a local `next build`);
 *                for a deployed target pass it explicitly (the build's manifest lists it under exportedName createBooking;
 *                ids change on every build).
 *  PEAK_VUS      default 50 · RUN_ID  tag in guest names, default a timestamp
 *
 * DATA: this creates real bookings (guest name "K6 LOAD <run>") in whatever database the server uses.
 * Remove them afterwards: `node scripts/cleanup-load-test.mjs`.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { SharedArray } from 'k6/data'

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ORG_ID = __ENV.ORG_ID || 'f350ebab-85d5-4846-8673-c2da58f96193'
const COURTS = (__ENV.COURT_IDS || '7f1819d8-6c0d-47a7-bd52-e6eea80555ee,e08c21cc-8371-4abf-9f39-f3ede7472f74').split(',')
const PEAK = Number(__ENV.PEAK_VUS || 50)
// Every VU is its own JS runtime, so anything random must be created once in setup() and passed in.
let RUN = __ENV.RUN_ID || ''

// Slot cadence (lib/court-slots.ts): 08:00 open, 00:00 close, padel 90+15 / tennis 60+15.
const GRID = { padel: { first: 8 * 60, step: 105, dur: 90 }, tennis: { first: 8 * 60, step: 75, dur: 60 } }
const COURT_SPORT = [GRID.padel, GRID.tennis]

const actionId = new SharedArray('action', () => {
  if (__ENV.ACTION_ID) return [__ENV.ACTION_ID]
  const manifest = JSON.parse(open('../.next/server/server-reference-manifest.json'))
  const hit = Object.entries(manifest.node || {}).find(([, v]) => v.exportedName === 'createBooking')
  if (!hit) throw new Error('createBooking not found in the manifest; set ACTION_ID')
  return [hit[0]]
})[0]

// ---- metrics -------------------------------------------------------------------------------
const bookingOk = new Counter('booking_created')
const bookingTaken = new Counter('booking_slot_taken')
const bookingLimited = new Counter('booking_rate_limited')
const bookingOther = new Counter('booking_other_refusal') // anything else; tagged by code
const bookingBroken = new Counter('booking_server_error') // unknown / 5xx / unparsable: must stay 0
const connReset = new Rate('connection_reset') // status 0: dropped connection, not an app answer
const apiLimited = new Counter('api_http_429')
const retryAfterOk = new Rate('retry_after_present')
const bookingTime = new Trend('booking_duration', true)
const hotWins = new Counter('hot_slot_wins')

// 429 is an intended answer in this test, so it must not count as http_req_failed.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429))

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      exec: 'mixed',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.min(20, PEAK) },
        { duration: '30s', target: PEAK },
        { duration: '1m', target: PEAK },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
    burst: { executor: 'per-vu-iterations', exec: 'burst', vus: 1, iterations: 1, startTime: '45s', maxDuration: '2m' },
  },
  thresholds: {
    // Real failures only: 429s are excluded by the response callback above.
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:booking}': ['p(95)<800'],
    'http_req_duration{kind:read}': ['p(95)<800'],
    booking_server_error: ['count==0'],
    connection_reset: ['rate<0.01'],
    // The burst must actually hit both limiters, and always say when to retry.
    api_http_429: ['count>0'],
    booking_rate_limited: ['count>0'],
    retry_after_present: ['rate==1'],
    hot_slot_wins: ['count<=1'],
    // Never fails: only here so k6 keeps a per-code breakdown of the refusals.
    'booking_other_refusal{code:invalid_slot}': ['count>=0'],
    'booking_other_refusal{code:slot_in_past}': ['count>=0'],
    'booking_other_refusal{code:unavailable}': ['count>=0'],
    'booking_other_refusal{code:invalid_input}': ['count>=0'],
    'booking_other_refusal{code:payment_failed}': ['count>=0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
}

// ---- helpers -------------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0')
function venueDay(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
/** ISO instant of `minutes` after midnight on a venue day (Africa/Tunis is UTC+1, no DST). */
function venueInstant(day, minutes) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + minutes * 60000 - 3600000).toISOString()
}
function slotsPerDay(g) {
  let n = 0
  for (let s = g.first; s + g.dur <= 1440; s += g.step) n++
  return n
}
/** The app books at most 60 days ahead (MAX_DAYS_AHEAD in lib/booking-core.ts). Days 2..58 here. */
const DAYS = 57
const PER_DAY = slotsPerDay(GRID.padel) + slotsPerDay(GRID.tennis) // 9 + 13
let SEED = 0
let HOT = null
function slotAt(courtIdx, dayOffset, slotIdx) {
  const g = COURT_SPORT[courtIdx % COURT_SPORT.length]
  const day = venueDay(dayOffset)
  const idx = slotIdx % slotsPerDay(g)
  return { courtId: COURTS[courtIdx % COURT_SPORT.length], date: day, startsAt: venueInstant(day, g.first + idx * g.step) }
}
/** The p-th distinct slot of the window (padel slots then tennis slots, day by day). */
function nthSlot(p) {
  p = ((p % (DAYS * PER_DAY)) + DAYS * PER_DAY) % (DAYS * PER_DAY)
  const day = 2 + Math.floor(p / PER_DAY)
  const k = p % PER_DAY
  const padel = slotsPerDay(GRID.padel)
  return k < padel ? slotAt(0, day, k) : slotAt(1, day, k - padel)
}
function fakeIp(vu) {
  return `10.${(vu >> 8) & 255}.${vu & 255}.${(Number(RUN.slice(-3)) % 200) + 1}`
}
function phone() {
  return `+2169${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
}

export function setup() {
  const run = __ENV.RUN_ID || String(Date.now())
  return {
    run,
    seed: Math.floor(Math.random() * DAYS * PER_DAY),
    // One shared padel slot 55-59 days out that every VU fights for.
    hot: slotAt(0, 55 + (Number(run.slice(-2)) % 5), Number(run.slice(-1)) % 9),
  }
}

/** Copy the shared run state into this VU's module variables (cheap, idempotent). */
function adopt(data) {
  RUN = data.run
  SEED = data.seed
  HOT = data.hot
}

/** Call the createBooking Server Action and classify the answer. */
function book(slot, ip, kind) {
  const body = JSON.stringify([
    {
      mode: 'guest',
      orgId: ORG_ID,
      courtId: slot.courtId,
      date: slot.date,
      startsAt: slot.startsAt,
      playerCount: 4,
      payment: 'cash',
      guest: { fullName: `K6 LOAD ${RUN}`, phone: phone() },
    },
  ])
  const res = http.post(`${BASE}/courts/${ORG_ID}`, body, {
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      'Next-Action': actionId,
      'x-forwarded-for': ip,
    },
    tags: { kind },
    timeout: '30s',
  })
  bookingTime.add(res.timings.duration)

  const text = res.body ? String(res.body) : ''
  const code = (text.match(/"code":"([a-z_]+)"/) || [])[1]
  const ok = /"ok":true/.test(text)
  connReset.add(res.status === 0)
  if (res.status === 0) return { res, ok: false, code: 'connection_reset' }
  if (res.status !== 200) {
    bookingBroken.add(1)
    console.warn('booking HTTP ' + res.status + ': ' + text.slice(0, 200))
  } else if (ok) bookingOk.add(1)
  else if (code === 'slot_taken') bookingTaken.add(1)
  else if (code === 'rate_limited') bookingLimited.add(1)
  else if (code === 'unknown' || !code) {
    bookingBroken.add(1)
    console.warn('booking answer without a known code: ' + text.slice(0, 200))
  }
  else bookingOther.add(1, { code })
  return { res, ok, code }
}

// ---- scenarios -----------------------------------------------------------------------------
let seq = 0
export function mixed(data) {
  adopt(data)
  const roll = Math.random()
  if (roll < 0.6) {
    // Public reads: list of clubs, then a club profile (slot matrix data).
    const list = http.get(`${BASE}/courts`, { tags: { kind: 'read' } })
    check(list, { '/courts 200': (r) => r.status === 200 })
    const club = http.get(`${BASE}/courts/${ORG_ID}`, { tags: { kind: 'read' } })
    check(club, { 'club page 200': (r) => r.status === 200 })
    sleep(1 + Math.random() * 2)
    return
  }

  seq++
  const ip = fakeIp(__VU)
  if (seq % 5 === 0) {
    const r = book(HOT, ip, 'booking')
    if (r.ok) hotWins.add(1)
    check(r, { 'hot slot: win or slot_taken, never an error': (x) => x.ok || x.code === 'slot_taken' || x.code === 'rate_limited' })
  } else {
    // Distinct slot per VU and iteration (7 is coprime with the window size), random start per run.
    const slot = nthSlot(SEED + ((__VU - 1) * 400 + seq) * 7)
    const r = book(slot, ip, 'booking')
    check(r, { 'booking answered cleanly': (x) => x.ok || ['slot_taken', 'rate_limited'].includes(x.code) })
  }
  // 10 bookings/min/IP is the limit; a VU that loops faster would only be testing the limiter.
  sleep(4 + Math.random() * 4)
}

export function burst(data) {
  adopt(data)
  // 1) Proxy limiter on /api: 60/min per IP+path. Unauthenticated, so below the limit it is 401.
  const ip = `10.250.${(Number(RUN.slice(-3)) % 250) + 1}.9`
  let first429 = 0
  for (let i = 1; i <= 80; i++) {
    const r = http.get(`${BASE}/api/v1/courts`, { headers: { 'x-forwarded-for': ip }, tags: { kind: 'burst' }, redirects: 0, responseCallback: http.expectedStatuses(401, 403, 429) })
    if (r.status === 429) {
      apiLimited.add(1)
      first429 ||= i
      retryAfterOk.add(Boolean(r.headers['Retry-After']) && Number(r.headers['Retry-After']) > 0)
    } else {
      check(r, { 'below the limit: 401/403 (no key), not 5xx': (x) => x.status < 500 })
    }
  }
  check(first429, { 'API 429 begins after 60 requests': (n) => n > 0 && n <= 62 })

  // 2) Booking limiter (Server Action): 10/min per IP -> `rate_limited`, not an error.
  let limited = 0
  const bip = `10.251.${(Number(RUN.slice(-3)) % 250) + 1}.9`
  for (let i = 0; i < 14; i++) {
    const r = book(nthSlot(SEED + 5000 + i * 7), bip, 'burst')
    if (r.code === 'rate_limited') limited++
  }
  check(limited, { 'booking burst hits rate_limited (>=3 of 14)': (n) => n >= 3 })
}

export function handleSummary(data) {
  const m = (k, f = 'count') => (data.metrics[k] && data.metrics[k].values[f]) ?? 0
  const t = (k) => data.metrics[k] && data.metrics[k].values
  const row = (name, v) => (v ? `${name.padEnd(22)} avg ${v.avg.toFixed(0)}ms  med ${v.med.toFixed(0)}  p95 ${v['p(95)'].toFixed(0)}  max ${v.max.toFixed(0)}` : '')
  const lines = [
    '',
    `ShiftGrid load test  ${BASE}  peak ${PEAK} VUs  run ${(data.setup_data && data.setup_data.run) || RUN}`,
    `requests              ${m('http_reqs')}   failed ${(m('http_req_failed', 'rate') * 100).toFixed(2)}%`,
    row('read latency', t('http_req_duration{kind:read}')),
    row('booking latency', t('http_req_duration{kind:booking}')),
    `bookings created      ${m('booking_created')}`,
    `slot taken (expected) ${m('booking_slot_taken')}   hot-slot winners ${m('hot_slot_wins')} (must be <= 1)`,
    `booking rate_limited  ${m('booking_rate_limited')}`,
    `API HTTP 429          ${m('api_http_429')}`,
    `other refusals        ${m('booking_other_refusal')}  (${['invalid_slot', 'slot_in_past', 'unavailable', 'invalid_input', 'payment_failed'].map((c) => c + ' ' + m('booking_other_refusal{code:' + c + '}')).join(', ')})`,
    `SERVER ERRORS         ${m('booking_server_error')} (must be 0)   connection resets ${(m('connection_reset', 'rate') * 100).toFixed(2)}%`,
    `cleanup: node scripts/cleanup-load-test.mjs`,
    '',
  ]
  return { stdout: lines.join('\n'), 'k6-summary.json': JSON.stringify(data, null, 2) }
}
