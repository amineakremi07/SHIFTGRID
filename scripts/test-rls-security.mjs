#!/usr/bin/env node
/**
 * Role-isolation and cross-tenant security checks, run as the real roles
 * (anon key + password sign-in) against the hosted project.
 *
 *   node scripts/test-rls-security.mjs
 *
 * Needs the four seeded accounts (scripts/seed-all-roles.mjs). It creates a
 * second approved club "RLS Probe Club" with one court and one booking, so
 * cross-tenant attempts have a real target, and removes everything at the end.
 *
 * A blocked write is either an error or a no-op (RLS filters the rows away),
 * so every write check re-reads the row with the service role and compares.
 * Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = { ...process.env }
try {
  for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PASSWORD = env.SEED_PASSWORD || 'ShiftGrid-Dev-1!'
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const fresh = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

async function signIn(email) {
  const sb = fresh()
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return { sb, id: data.user.id }
}

const ids = { org: null, court: null, booking: null }
const startsAt = (() => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 70)
  d.setUTCHours(9, 0, 0, 0) // 10:00 Tunis
  return d.toISOString()
})()

try {
  const { data: home } = await admin.from('organizations').select('id').eq('name', 'ShiftGrid Test Club').single()
  const { data: homeCourt } = await admin.from('courts').select('id, name, status').eq('org_id', home.id).limit(1).single()

  // ---- Fixture: a second approved club with a court and a booking -------------------------
  const org = await admin
    .from('organizations')
    .insert({ name: 'RLS Probe Club', status: 'approved', city: 'Tunis', address: 'Probe street', sport_types: ['padel'] })
    .select('id')
    .single()
  if (org.error) throw new Error(`fixture org: ${org.error.message}`)
  ids.org = org.data.id
  const court = await admin
    .from('courts')
    .insert({ org_id: ids.org, name: 'Probe court', sport: 'padel', status: 'active', price_per_hour: 80, open_time: '08:00', close_time: '23:00' })
    .select('id')
    .single()
  if (court.error) throw new Error(`fixture court: ${court.error.message}`)
  ids.court = court.data.id
  const bk = await admin.rpc('create_booking', {
    p_org_id: ids.org, p_court_id: ids.court, p_sport: 'padel', p_starts_at: startsAt,
    p_player_count: 4, p_amount: 90, p_guest_name: 'RLS Probe Guest', p_guest_phone: '+21698555111',
  })
  if (bk.error) throw new Error(`fixture booking: ${bk.error.message}`)
  ids.booking = bk.data?.booking_id ?? bk.data?.id ?? bk.data?.[0]?.booking_id ?? bk.data?.[0]?.id
  const foreign = { org: ids.org, court: ids.court, booking: ids.booking }

  const [owner, staff, player] = await Promise.all([
    signIn('owner@shiftgrid.local'),
    signIn('staff@shiftgrid.local'),
    signIn('player@shiftgrid.local'),
  ])
  const adminUser = await signIn('admin@shiftgrid.local')
  const anon = fresh()

  const rowOf = async (table, id, cols) => (await admin.from(table).select(cols).eq('id', id).single()).data

  // ---- anon -------------------------------------------------------------------------------
  for (const t of ['profiles', 'bookings', 'payment_records', 'anonymous_bookers', 'staff_invites', 'booking_shares', 'notifications', 'api_keys']) {
    const r = await anon.from(t).select('*').limit(5)
    check(!r.error ? (r.data ?? []).length === 0 : true, `anon reads no rows from ${t}`, r.error?.code ?? `${r.data?.length} rows`)
  }
  {
    const orgs = await anon.from('organizations').select('id, status').limit(100)
    check(!orgs.error && orgs.data.every((o) => o.status === 'approved'), 'anon sees only approved organizations')
    const priv = await anon.from('organizations').select('verification_documents, registry_number').limit(1)
    check(Boolean(priv.error), 'anon cannot read private organization columns', priv.error?.code)
    const ins = await anon.from('bookings').insert({ org_id: foreign.org, court_id: foreign.court, sport: 'padel', starts_at: startsAt, player_count: 4, status: 'pending_payment' })
    check(Boolean(ins.error), 'anon cannot insert bookings', ins.error?.code)
    const rpc = await anon.rpc('create_booking', { p_org_id: foreign.org, p_court_id: foreign.court, p_sport: 'padel', p_starts_at: startsAt, p_player_count: 4, p_amount: 0, p_guest_name: 'x', p_guest_phone: '+21698000000' })
    check(Boolean(rpc.error), 'anon cannot call create_booking()', rpc.error?.code)
  }

  // ---- cross-tenant reads (owner / staff / player of the home club) ----------------------
  for (const [name, u] of [['org_admin', owner], ['staff', staff], ['player', player]]) {
    const b = await u.sb.from('bookings').select('id').eq('id', foreign.booking)
    check(!b.error && b.data.length === 0, `${name} cannot read another club's booking`)
    const own = await u.sb.from('bookings').select('org_id').limit(200)
    check(!own.error && own.data.every((r) => r.org_id === home.id), `${name} sees only home-club bookings`)
    const g = await u.sb.from('anonymous_bookers').select('org_id').limit(200)
    check(!g.error && g.data.every((r) => r.org_id === home.id), `${name} sees only home-club guests`)
    const prof = await u.sb.from('profiles').select('org_id').limit(200)
    check(!prof.error && prof.data.every((r) => r.org_id === home.id), `${name} sees only home-club profiles`)
    const pay = await u.sb.from('payment_records').select('booking_id').eq('booking_id', foreign.booking)
    check(!pay.error && pay.data.length === 0, `${name} cannot read another club's payments`)
  }
  {
    const pr = await player.sb.from('profiles').select('id').neq('id', player.id)
    check(!pr.error && pr.data.length === 0, 'player sees only their own profile')
    const pay = await player.sb.from('payment_records').select('id').limit(5)
    check(!pay.error && pay.data.length === 0, 'player cannot read payment_records')
    const inv = await player.sb.from('staff_invites').select('id').limit(5)
    check(!inv.error && inv.data.length === 0, 'player cannot read staff_invites')
    const k = await player.sb.from('api_keys').select('id').limit(5)
    check(!k.error && k.data.length === 0, 'player cannot read api_keys')
  }
  for (const [name, u] of [['org_admin', owner], ['staff', staff], ['player', player]]) {
    const n = await u.sb.from('notifications').select('id').limit(1)
    check(Boolean(n.error) || n.data.length === 0, `${name} cannot read the notifications outbox`, n.error?.code)
  }

  // ---- cross-tenant writes ----------------------------------------------------------------
  for (const [name, u] of [['org_admin', owner], ['staff', staff]]) {
    const before = await rowOf('bookings', foreign.booking, 'status, cancellation_reason')
    await u.sb.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rls probe' }).eq('id', foreign.booking)
    const after = await rowOf('bookings', foreign.booking, 'status, cancellation_reason')
    check(after.status === before.status && after.cancellation_reason === before.cancellation_reason, `${name} cannot cancel another club's booking`)
    await u.sb.from('bookings').delete().eq('id', foreign.booking)
    check(Boolean(await rowOf('bookings', foreign.booking, 'id')), `${name} cannot delete another club's booking`)
    const ins = await u.sb.from('bookings').insert({ org_id: foreign.org, court_id: foreign.court, sport: 'padel', starts_at: startsAt, player_count: 4, status: 'confirmed' })
    check(Boolean(ins.error), `${name} cannot insert a booking into another club`, ins.error?.code)
  }
  {
    const before = await rowOf('courts', foreign.court, 'name, price_per_hour, status')
    await owner.sb.from('courts').update({ name: 'hijacked', price_per_hour: 1, status: 'maintenance' }).eq('id', foreign.court)
    await owner.sb.from('courts').delete().eq('id', foreign.court)
    const after = await rowOf('courts', foreign.court, 'name, price_per_hour, status')
    check(JSON.stringify(after) === JSON.stringify(before), "org_admin cannot edit or delete another club's court")
    const ins = await owner.sb.from('courts').insert({ org_id: foreign.org, name: 'planted', sport: 'padel', status: 'active', price_per_hour: 1 })
    check(Boolean(ins.error), 'org_admin cannot add a court to another club', ins.error?.code)
    // staff can read but not write courts of their own club
    const s = await staff.sb.from('courts').update({ name: 'staff rename' }).eq('id', homeCourt.id).select('id')
    const nowCourt = await rowOf('courts', homeCourt.id, 'name')
    check(nowCourt.name === homeCourt.name && !(s.data?.length), 'staff cannot edit courts, even in their own club')
  }

  // ---- organization verification fields: nobody but the server may write ------------------
  {
    const before = await rowOf('organizations', home.id, 'status, verified_by, verified_at, rejection_reason, registry_number, name')
    const attempts = [
      { status: 'suspended' },
      { verified_by: owner.id },
      { verified_at: '2000-01-01T00:00:00Z' },
      { rejection_reason: 'self' },
      { registry_number: 'FAKE-123' },
      { name: 'Renamed by owner' },
    ]
    for (const patch of attempts) await owner.sb.from('organizations').update(patch).eq('id', home.id)
    await staff.sb.from('organizations').update({ name: 'Renamed by staff' }).eq('id', home.id)
    await owner.sb.from('organizations').update({ name: 'Hijack' }).eq('id', foreign.org)
    const after = await rowOf('organizations', home.id, 'status, verified_by, verified_at, rejection_reason, registry_number, name')
    check(JSON.stringify(after) === JSON.stringify(before), 'org_admin/staff cannot change organization fields (status, verification, name)')
    const other = await rowOf('organizations', foreign.org, 'name')
    check(other.name === 'RLS Probe Club', "org_admin cannot edit another club's organization row")
    const mk = await owner.sb.from('organizations').insert({ name: 'Rogue Club', status: 'approved' })
    check(Boolean(mk.error), 'org_admin cannot create an approved organization', mk.error?.code)
  }

  // ---- payments & locks are server-only ---------------------------------------------------
  {
    const pay = await admin.from('payment_records').select('id, status, amount').eq('booking_id', foreign.booking).single()
    await owner.sb.from('payment_records').update({ status: 'paid', amount: 0 }).eq('id', pay.data.id)
    const after = await rowOf('payment_records', pay.data.id, 'status, amount')
    check(after.status === pay.data.status && after.amount === pay.data.amount, "org_admin cannot edit another club's payment")
    const homeBooking = await admin.from('bookings').select('id').eq('org_id', home.id).limit(1)
    if (homeBooking.data?.length) {
      const hp = await admin.from('payment_records').select('id, status').eq('booking_id', homeBooking.data[0].id).limit(1)
      if (hp.data?.length) {
        await owner.sb.from('payment_records').update({ status: 'paid' }).eq('id', hp.data[0].id)
        const a = await rowOf('payment_records', hp.data[0].id, 'status')
        check(a.status === hp.data[0].status, 'org_admin cannot mark payments paid from the client (Mark paid is a server action)')
      }
    }
    const lock = await player.sb.from('court_slot_locks').insert({ court_id: homeCourt.id, booking_id: foreign.booking, occupied_from: '2031-01-01T10:00:00Z', occupied_until: '2031-01-01T11:30:00Z' })
    check(Boolean(lock.error), 'a client cannot insert court_slot_locks', lock.error?.code)
    const del = await owner.sb.from('court_slot_locks').delete().eq('booking_id', foreign.booking)
    const stillLocked = await admin.from('court_slot_locks').select('booking_id').eq('booking_id', foreign.booking)
    check(stillLocked.data.length === 1, "org_admin cannot release another club's slot lock", del.error?.code)
  }

  // ---- players: no direct booking insert, no tampering -----------------------------------
  {
    const ins = await player.sb.from('bookings').insert({
      org_id: home.id, court_id: homeCourt.id, sport: 'padel', starts_at: startsAt, player_count: 4,
      payment_method: 'cash', status: 'pending_payment', booker_profile_id: player.id,
    })
    check(Boolean(ins.error), 'player cannot insert a booking through the REST API', ins.error?.code)
    const rpc = await player.sb.rpc('create_booking', { p_org_id: home.id, p_court_id: homeCourt.id, p_sport: 'padel', p_starts_at: startsAt, p_player_count: 4, p_amount: 0, p_guest_name: 'x', p_guest_phone: '+21698000000' })
    check(Boolean(rpc.error), 'player cannot call create_booking() directly', rpc.error?.code)
    const mk = await player.sb.rpc('mark_cash_paid', { p_booking_id: foreign.booking })
    check(Boolean(mk.error), 'player cannot call mark_cash_paid()', mk.error?.code)
    const gk = await player.sb.rpc('generate_api_key', { p_organization_id: home.id, p_name: 'probe', p_permissions: ['read'], p_rate_limit: 10, p_expires_at: null })
    check(Boolean(gk.error), 'player cannot generate an API key', gk.error?.code)
    const gx = await staff.sb.rpc('generate_api_key', { p_organization_id: home.id, p_name: 'probe', p_permissions: ['read'], p_rate_limit: 10, p_expires_at: null })
    check(Boolean(gx.error), 'staff cannot generate an API key', gx.error?.code)
    const gf = await owner.sb.rpc('generate_api_key', { p_organization_id: foreign.org, p_name: 'probe', p_permissions: ['read'], p_rate_limit: 10, p_expires_at: null })
    check(Boolean(gf.error), "org_admin cannot generate an API key for another club", gf.error?.code)
  }

  // ---- privilege escalation on profiles ---------------------------------------------------
  {
    const targets = [['player', player, 'org_admin'], ['staff', staff, 'org_admin'], ['org_admin', owner, 'platform_admin']]
    for (const [name, u, target] of targets) {
      const before = await rowOf('profiles', u.id, 'role, org_id')
      await u.sb.from('profiles').update({ role: target }).eq('id', u.id)
      await u.sb.from('profiles').update({ org_id: foreign.org }).eq('id', u.id)
      const after = await rowOf('profiles', u.id, 'role, org_id')
      check(after.role === before.role && after.org_id === before.org_id, `${name} cannot change own role or club`)
    }
    const before = await rowOf('profiles', staff.id, 'role')
    await owner.sb.from('profiles').update({ role: 'org_admin' }).eq('id', staff.id)
    check((await rowOf('profiles', staff.id, 'role')).role === before.role, 'org_admin cannot promote staff from the client')
    const mk = await player.sb.from('profiles').insert({ id: crypto.randomUUID(), org_id: home.id, role: 'platform_admin' })
    check(Boolean(mk.error), 'a client cannot insert a profile (no self-made platform_admin)', mk.error?.code)
  }

  // ---- platform admin: sees everything, cannot be impersonated ---------------------------
  {
    const orgs = await adminUser.sb.from('organizations').select('id').in('id', [home.id, foreign.org])
    check(!orgs.error && orgs.data.length === 2, 'platform_admin sees every organization')
    const bk = await adminUser.sb.from('bookings').select('id').eq('id', foreign.booking)
    check(!bk.error && bk.data.length === 1, 'platform_admin reads bookings across clubs')
    const n = await adminUser.sb.from('notifications').select('id').limit(1)
    check(Boolean(n.error) || n.data.length === 0, 'even platform_admin cannot read the outbox from the client', n.error?.code)
  }
} catch (e) {
  console.error('Security test crashed:', e.message ?? e)
  failures++
} finally {
  if (ids.booking) await admin.from('bookings').delete().eq('id', ids.booking)
  await admin.from('anonymous_bookers').delete().eq('name', 'RLS Probe Guest')
  if (ids.court) await admin.from('courts').delete().eq('id', ids.court)
  if (ids.org) await admin.from('organizations').delete().eq('id', ids.org)
  console.log('\nfixtures removed')
}
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed')
process.exit(failures ? 1 : 0)
