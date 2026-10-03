#!/usr/bin/env node
/**
 * Database-level checks for the booking and payment engine (Milestone 9), run
 * against the seeded "ShiftGrid Test Club" (scripts/seed-all-roles.mjs):
 *   - concurrent bookings of the same slot: exactly one wins;
 *   - full online payment, split payment (invites, last share confirms), cash;
 *   - cancelling refunds what was paid and kills unpaid invites;
 *   - RLS: players and anon cannot read other people's shares or call the RPCs.
 * Everything it creates is deleted at the end.
 *
 *   node scripts/verify-payments.mjs
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = { ...process.env }
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const PASSWORD = env.SEED_PASSWORD || 'ShiftGrid-Dev-1!'
const sha = (t) => createHash('sha256').update(t).digest('hex')

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const created = []

const { data: org } = await admin.from('organizations').select('id').eq('name', 'ShiftGrid Test Club').single()
const { data: court } = await admin.from('courts').select('id').eq('org_id', org.id).eq('sport', 'padel').limit(1).single()
const { data: other } = await admin.from('organizations').select('id').eq('name', 'ShiftGrid Platform').single()

// a future slot, `day` days ahead at the given Tunis hour (Tunis = UTC+1)
const slot = (day, hour, minute = 0) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + day)
  d.setUTCHours(hour - 1, minute, 0, 0)
  return d.toISOString()
}
const book = (startsAt, who = 'A') =>
  admin.rpc('create_booking', {
    p_org_id: org.id,
    p_court_id: court.id,
    p_sport: 'padel',
    p_starts_at: startsAt,
    p_player_count: 4,
    p_amount: 90,
    p_guest_name: `Verify ${who}`,
    p_guest_phone: '+21698111222',
  })
const fresh = async (startsAt) => {
  const r = await book(startsAt)
  if (r.error) throw new Error('setup booking failed: ' + r.error.message)
  created.push(r.data.booking_id)
  return r.data
}
const row = async (id) => (await admin.from('bookings').select('status, payment_method').eq('id', id).single()).data
const pay = async (id) => (await admin.from('payment_records').select('status, provider').eq('booking_id', id).single()).data

try {
  // 1. concurrency ---------------------------------------------------------
  const t = slot(20, 10)
  const results = await Promise.all([book(t, 'A'), book(t, 'B'), book(t, 'C')])
  results.forEach((r) => r.data && created.push(r.data.booking_id))
  const wins = results.filter((r) => !r.error)
  const losses = results.filter((r) => r.error)
  check(wins.length === 1 && losses.length === 2, 'three simultaneous bookings of one slot: exactly one wins', `${wins.length} won`)
  check(losses.every((r) => ['23505', '23P01'].includes(r.error.code)), 'the losers get a conflict error', losses.map((r) => r.error.code).join(','))
  const overlap = await book(slot(20, 10, 30), 'D') // overlapping, different start
  check(overlap.error?.code === '23P01', 'an overlapping start is rejected by the exclusion constraint', overlap.error?.code)

  // 2. full online payment ----------------------------------------------------
  const full = await fresh(slot(21, 10))
  const s1 = await admin.rpc('settle_booking_online', { p_booking_id: full.booking_id, p_provider: 'test' })
  check(
    !s1.error && (await row(full.booking_id)).status === 'confirmed' && (await pay(full.booking_id)).status === 'paid',
    'pay in full: booking confirmed, payment paid'
  )
  const s2 = await admin.rpc('settle_booking_online', { p_booking_id: full.booking_id, p_provider: 'test' })
  check(s2.error?.message.includes('booking_not_payable'), 'paying a confirmed booking again is refused')

  // 3. split ----------------------------------------------------------------------
  const sp = await fresh(slot(22, 10))
  const sh = await admin.rpc('create_booking_shares', { p_booking_id: sp.booking_id, p_provider: 'test', p_share_count: 4 })
  const invites = sh.data?.invites ?? []
  check(
    !sh.error && invites.length === 3 && Number(sh.data.organizer_amount) === 22.5 && invites.every((i) => Number(i.amount) === 22.5),
    'split: organizer pays 22.50 and gets 3 invites of 22.50',
    sh.error?.message
  )
  check((await row(sp.booking_id)).status === 'pending_payment', 'split: booking stays pending while shares are unpaid')
  const dup = await admin.rpc('create_booking_shares', { p_booking_id: sp.booking_id, p_provider: 'test', p_share_count: 4 })
  check(dup.error?.message.includes('shares_exist'), 'shares cannot be created twice')
  const bad = await admin.rpc('pay_booking_share', { p_token_hash: sha(randomBytes(24).toString('hex')), p_provider: 'test' })
  check(bad.error?.message.includes('invalid_invite'), 'a made-up invite token is refused')
  const p1 = await admin.rpc('pay_booking_share', { p_token_hash: sha(invites[0].token), p_provider: 'test', p_payer_name: 'Friend 1' })
  const again = await admin.rpc('pay_booking_share', { p_token_hash: sha(invites[0].token), p_provider: 'test' })
  check(!p1.error && p1.data.confirmed === false && again.error?.message.includes('already_paid'), 'a share can be paid once')
  await admin.rpc('pay_booking_share', { p_token_hash: sha(invites[1].token), p_provider: 'test' })
  check((await row(sp.booking_id)).status === 'pending_payment', 'split: still pending with 3 of 4 paid')
  const last = await admin.rpc('pay_booking_share', { p_token_hash: sha(invites[2].token), p_provider: 'test' })
  check(
    last.data?.confirmed === true && (await row(sp.booking_id)).status === 'confirmed' && (await pay(sp.booking_id)).status === 'paid',
    'split: the last share confirms the booking and settles the payment'
  )
  const tooMany = await fresh(slot(23, 10))
  const wrong = await admin.rpc('create_booking_shares', { p_booking_id: tooMany.booking_id, p_provider: 'test', p_share_count: 3 })
  check(wrong.error?.message.includes('invalid_share_count'), 'share count must equal the player count')

  // 4. cancelling ----------------------------------------------------------------------
  const cp = await fresh(slot(24, 10))
  const csh = await admin.rpc('create_booking_shares', { p_booking_id: cp.booking_id, p_provider: 'test', p_share_count: 4 })
  await admin.rpc('pay_booking_share', { p_token_hash: sha(csh.data.invites[0].token), p_provider: 'test' })
  await admin.from('bookings').update({ status: 'cancelled', cancellation_reason: 'verify' }).eq('id', cp.booking_id)
  const { data: shares } = await admin.from('booking_shares').select('status').eq('booking_id', cp.booking_id)
  check(
    shares.filter((s) => s.status === 'refunded').length === 2 && shares.filter((s) => s.status === 'pending').length === 2,
    'cancelling refunds the paid shares (organizer + 1 friend) and leaves unpaid ones pending'
  )
  const late = await admin.rpc('pay_booking_share', { p_token_hash: sha(csh.data.invites[1].token), p_provider: 'test' })
  check(late.error?.message.includes('booking_not_payable'), 'an invite for a cancelled booking cannot be paid')
  const cf = await fresh(slot(25, 10))
  await admin.rpc('settle_booking_online', { p_booking_id: cf.booking_id, p_provider: 'test' })
  await admin.from('bookings').update({ status: 'cancelled' }).eq('id', cf.booking_id)
  check((await pay(cf.booking_id)).status === 'refunded', 'cancelling a fully paid booking marks the payment refunded')
  const { count: locks } = await admin.from('court_slot_locks').select('*', { count: 'exact', head: true }).eq('booking_id', cf.booking_id)
  check(locks === 0, 'the slot lock is released on cancel')

  // 5. cash --------------------------------------------------------------------------------
  const cash = await fresh(slot(26, 10))
  const wrongOrg = await admin.rpc('mark_cash_paid', { p_booking_id: cash.booking_id, p_org_id: other.id })
  check(wrongOrg.error?.message.includes('booking_not_payable'), 'another club cannot mark this booking paid')
  const ok = await admin.rpc('mark_cash_paid', { p_booking_id: cash.booking_id, p_org_id: org.id })
  check(
    !ok.error && (await row(cash.booking_id)).status === 'confirmed' && (await pay(cash.booking_id)).status === 'paid',
    'staff mark cash paid: booking confirmed, payment paid'
  )
  const twice = await admin.rpc('mark_cash_paid', { p_booking_id: cash.booking_id, p_org_id: org.id })
  check(twice.error?.message.includes('nothing_to_pay'), 'cash cannot be collected twice')

  // 6. RLS / privileges --------------------------------------------------------------------------
  const rpcAnon = await anon.rpc('settle_booking_online', { p_booking_id: full.booking_id, p_provider: 'test' })
  check(Boolean(rpcAnon.error), 'anon cannot call the payment functions', rpcAnon.error?.code)
  const anonShares = await anon.from('booking_shares').select('id').limit(1)
  check((anonShares.data ?? []).length === 0, 'anon cannot read shares')
  const player = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await player.auth.signInWithPassword({ email: 'player@shiftgrid.local', password: PASSWORD })
  const own = await player.from('booking_shares').select('id').eq('booking_id', sp.booking_id)
  check((own.data ?? []).length === 0, 'a player cannot read shares of someone elses booking')
  const rpcPlayer = await player.rpc('mark_cash_paid', { p_booking_id: cash.booking_id, p_org_id: org.id })
  check(Boolean(rpcPlayer.error), 'a signed-in player cannot call the payment functions', rpcPlayer.error?.code)
  const ins = await player.from('booking_shares').insert({ booking_id: sp.booking_id, share_no: 9, amount: 1, invite_token_hash: 'x' })
  check(Boolean(ins.error), 'a player cannot insert shares', ins.error?.code)
  const owner = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await owner.auth.signInWithPassword({ email: 'owner@shiftgrid.local', password: PASSWORD })
  const staffView = await owner.from('booking_shares').select('id').eq('booking_id', sp.booking_id)
  check((staffView.data ?? []).length === 4, 'the club owner can read the club shares', String(staffView.data?.length))
  const upd = await owner.from('booking_shares').update({ status: 'paid' }).eq('booking_id', sp.booking_id).select('id')
  check(!upd.data?.length, 'even the owner cannot edit shares through the API')
} catch (e) {
  console.error('Verify crashed:', e.message ?? e)
  failures++
} finally {
  if (created.length) await admin.from('bookings').delete().in('id', created)
  console.log(`\ncleaned up ${created.length} test bookings`)
}
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed')
process.exit(failures ? 1 : 0)
