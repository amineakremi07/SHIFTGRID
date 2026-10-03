#!/usr/bin/env node
/**
 * Double-booking, RLS and concurrency checks for the booking engine, run against
 * the seeded "ShiftGrid Test Club" (scripts/seed-all-roles.mjs).
 *
 *   node scripts/verify-booking-concurrency.mjs
 *
 * Two layers can stop a double booking, and both are exercised:
 *   1. the create_booking() RPC (what the app uses), called concurrently with the
 *      service role;
 *   2. the database itself, reached the way a hostile client would: a signed-in
 *      player inserting straight into `bookings` through the REST API (RLS lets a
 *      player insert only their own pending booking), racing the RPC for the
 *      same court and time.
 * In every race exactly one booking must exist afterwards, owning exactly one
 * court_slot_locks row; losers get 23505 (same start) or 23P01 (overlap).
 * Everything created is deleted at the end.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = { ...process.env }
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const PASSWORD = env.SEED_PASSWORD || 'ShiftGrid-Dev-1!'
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const newClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const { data: org } = await admin.from('organizations').select('id').eq('name', 'ShiftGrid Test Club').single()
const { data: court } = await admin.from('courts').select('id').eq('org_id', org.id).eq('sport', 'padel').limit(1).single()
const { data: courts2 } = await admin.from('courts').select('id').eq('org_id', org.id).eq('sport', 'tennis').limit(1).single()

// A future Tunis-time slot (UTC+1), `day` days ahead.
const slot = (day, hour, minute = 0) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + day)
  d.setUTCHours(hour - 1, minute, 0, 0)
  return d.toISOString()
}

const tracked = new Set()
const track = (r) => {
  const id = r.data?.booking_id ?? r.data?.id ?? (Array.isArray(r.data) ? r.data[0]?.id : undefined)
  if (id) tracked.add(id)
  return r
}

const rpcBook = (startsAt, who, courtId = court.id, sport = 'padel') =>
  admin
    .rpc('create_booking', {
      p_org_id: org.id,
      p_court_id: courtId,
      p_sport: sport,
      p_starts_at: startsAt,
      p_player_count: sport === 'padel' ? 4 : 2,
      p_amount: 90,
      p_guest_name: `Race ${who}`,
      p_guest_phone: '+21698777000',
    })
    .then(track)

async function locksFor(ids) {
  const { data } = await admin.from('court_slot_locks').select('booking_id').in('booking_id', ids)
  return data ?? []
}

try {
  // ---- 1. N identical bookings at once, through the RPC -----------------------------
  {
    const N = 10
    const t = slot(50, 10)
    const results = await Promise.all(Array.from({ length: N }, (_, i) => rpcBook(t, i)))
    const wins = results.filter((r) => !r.error)
    const losses = results.filter((r) => r.error)
    check(wins.length === 1, `${N} concurrent identical bookings: exactly one wins`, `${wins.length} won`)
    check(
      losses.every((r) => ['23505', '23P01'].includes(r.error.code)),
      'every loser is a unique/exclusion violation, not a random failure',
      [...new Set(losses.map((r) => r.error.code))].join(',')
    )
    const { data: rows } = await admin.from('bookings').select('id').eq('court_id', court.id).eq('starts_at', t)
    check(rows.length === 1, 'the database holds one booking for that court and time', String(rows.length))
    check((await locksFor(rows.map((r) => r.id))).length === 1, 'and exactly one slot lock')
    const { data: pays } = await admin.from('payment_records').select('id').in('booking_id', rows.map((r) => r.id))
    check(pays.length === 1, 'a losing booking leaves no orphan payment record (the RPC is one transaction)')
  }

  // ---- 2. overlapping but different start times -----------------------------------------
  {
    // 10:00-11:30 (+15 buffer) vs 10:30 / 11:00 / 11:20: all overlap the first.
    const starts = [slot(51, 10), slot(51, 10, 30), slot(51, 11), slot(51, 11, 20)]
    const results = await Promise.all(starts.map((s, i) => rpcBook(s, `o${i}`)))
    const wins = results.filter((r) => !r.error)
    check(wins.length === 1, 'four overlapping starts at once: exactly one wins', `${wins.length} won`)
    check(
      results.filter((r) => r.error).every((r) => r.error.code === '23P01'),
      'overlap losers are rejected by the exclusion constraint (23P01)'
    )
  }

  // ---- 3. back-to-back is fine; another court is independent ------------------------------
  {
    const a = await rpcBook(slot(52, 8), 'first')
    const b = await rpcBook(slot(52, 9, 45), 'after') // exactly duration + buffer later
    check(!a.error && !b.error, 'a booking starting right after duration + buffer succeeds', a.error?.message ?? b.error?.message)
    const [x, y] = await Promise.all([rpcBook(slot(53, 10), 'same-time-padel'), rpcBook(slot(53, 10), 'same-time-tennis', courts2.id, 'tennis')])
    check(!x.error && !y.error, 'the same time on two different courts both succeed', x.error?.message ?? y.error?.message)
  }

  // ---- 4. cancelling frees the slot immediately ---------------------------------------------
  {
    const t = slot(54, 10)
    const first = await rpcBook(t, 'cancelme')
    const blocked = await rpcBook(t, 'blocked')
    await admin.from('bookings').update({ status: 'cancelled', cancellation_reason: 'verify' }).eq('id', first.data.booking_id)
    const retry = await rpcBook(t, 'retry')
    check(first.error === null && Boolean(blocked.error) && !retry.error, 'after a cancellation the same slot can be booked again', retry.error?.message)
  }

  // ---- 5. RLS: a player cannot sidestep the engine through the REST API ---------------------
  {
    const player = newClient()
    const signedIn = await player.auth.signInWithPassword({ email: 'player@shiftgrid.local', password: PASSWORD })
    const playerId = signedIn.data.user.id
    const t = slot(55, 10)
    const direct = (extra = {}) =>
      player
        .from('bookings')
        .insert({
          org_id: org.id,
          court_id: court.id,
          sport: 'padel',
          starts_at: t,
          player_count: 4,
          payment_method: 'cash',
          status: 'pending_payment',
          booker_profile_id: playerId,
          ...extra,
        })
        .select('id')
        .then(track)

    // The RPC and three direct inserts race for one slot.
    const results = await Promise.all([rpcBook(t, 'rpc'), direct(), direct(), direct()])
    const wins = results.filter((r) => !r.error)
    check(wins.length === 1, 'RPC and 3 direct REST inserts racing for one slot: exactly one wins', `${wins.length} won`)
    const { data: rows } = await admin.from('bookings').select('id').eq('court_id', court.id).eq('starts_at', t)
    check(rows.length === 1 && (await locksFor(rows.map((r) => r.id))).length === 1, 'one booking and one lock remain')

    // RLS limits what a player may insert at all.
    const other = await direct({ starts_at: slot(55, 14), booker_profile_id: '00000000-0000-0000-0000-000000000001' })
    check(Boolean(other.error), "a player cannot insert a booking in someone else's name", other.error?.code)
    const confirmed = await direct({ starts_at: slot(55, 15), status: 'confirmed' })
    check(Boolean(confirmed.error), 'a player cannot insert a booking that is already confirmed', confirmed.error?.code)
    const rpcDirect = await player.rpc('create_booking', {
      p_org_id: org.id, p_court_id: court.id, p_sport: 'padel', p_starts_at: slot(55, 16), p_player_count: 4, p_amount: 0, p_guest_name: 'x', p_guest_phone: '+21698000000',
    })
    check(Boolean(rpcDirect.error), 'a player cannot call create_booking() directly to pick their own price', rpcDirect.error?.code)
    // A player cannot read other people's bookings either.
    const peek = await player.from('bookings').select('id, booker_profile_id').eq('court_id', court.id).eq('starts_at', t)
    check(!peek.error && (peek.data ?? []).every((r) => r.booker_profile_id === playerId), 'a player only ever sees their own bookings')
  }
} catch (e) {
  console.error('Verify crashed:', e.message ?? e)
  failures++
} finally {
  if (tracked.size) await admin.from('bookings').delete().in('id', [...tracked])
  // guests created by the races
  await admin.from('anonymous_bookers').delete().like('name', 'Race %')
  console.log(`\ncleaned up ${tracked.size} test bookings`)
}
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed')
process.exit(failures ? 1 : 0)
