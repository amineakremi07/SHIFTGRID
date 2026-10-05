#!/usr/bin/env node
/**
 * Verifies the hybrid data-retention policy against the project in .env.local, with real REST
 * calls as anon, as a club owner and as the service role:
 *
 *   soft delete   courts / clubs are archived (deleted_at), hidden from the public, bookings stay
 *   no hard delete bookings, and anything with booking history, cannot be deleted by anyone
 *   anonymization a player is erased but the history and counters stay
 *
 * It creates its own clubs and accounts ("ZZRET...") and removes them afterwards. It never touches
 * existing data. Run:  npm run verify:retention
 */
import { readFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const client = () => createClient(URL, ANON, { auth: { persistSession: false } })
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

let failures = 0
const check = (ok, name, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`)
}

const tag = `ZZRET${Date.now()}`
const PASSWORD = 'Retention-Test-1!'
const created = { orgs: [], users: [], bookings: [], guests: [] }
const inDays = (n) => new Date(Math.ceil((Date.now() + n * 864e5) / 36e5) * 36e5).toISOString()

async function org(label) {
  const o = must(await admin.from('organizations').insert({ name: `${tag} ${label}`, status: 'approved', city: 'Tunis', sport_types: ['padel'] }).select('id').single(), 'org')
  created.orgs.push(o.id)
  const c = must(await admin.from('courts').insert({ org_id: o.id, name: `${label} Court`, sport: 'padel', status: 'active', open_time: '08:00', close_time: '00:00', price_per_hour: 60 }).select('id').single(), 'court')
  return { orgId: o.id, courtId: c.id }
}
async function user(label, role, orgId, extra = {}) {
  const email = `${tag.toLowerCase()}-${label}@shiftgrid.local`
  const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: `Tmp ${label}` } })
  if (u.error) throw new Error(u.error.message)
  created.users.push(u.data.user.id)
  must(await admin.from('profiles').insert({ id: u.data.user.id, org_id: orgId, role, display_name: `Real ${label}`, phone: '+21698111222', ...extra }), 'profile')
  const c = client()
  const login = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (login.error) throw new Error(login.error.message)
  return { id: u.data.user.id, email, sb: c }
}
async function book(o, profileId, startsAt, courtId = o.courtId) {
  const r = must(
    await admin.rpc('create_booking', { p_org_id: o.orgId, p_court_id: courtId, p_sport: 'padel', p_starts_at: startsAt, p_player_count: 4, p_amount: 60, p_profile_id: profileId }),
    'booking'
  )
  created.bookings.push(r.booking_id)
  return r.booking_id
}

async function cleanup() {
  if (created.bookings.length) await admin.rpc('purge_bookings', { p_ids: created.bookings })
  for (const id of created.orgs) {
    const { data: left } = await admin.from('bookings').select('id').eq('org_id', id)
    if (left?.length) await admin.rpc('purge_bookings', { p_ids: left.map((b) => b.id) })
  }
  await admin.from('anonymous_bookers').delete().like('name', `${tag}%`)
  for (const id of created.users) {
    await admin.from('organization_members').delete().eq('user_id', id)
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  for (const id of created.orgs) {
    await admin.from('courts').delete().eq('org_id', id)
    await admin.from('organizations').delete().eq('id', id)
  }
}

try {
  const A = await org('Alpha')
  const owner = await user('owner', 'org_admin', A.orgId)
  const player = await user('player', 'player', A.orgId, { no_show_count: 1, trust_score: 70 })

  // a past booking cannot go through create_booking (slot_in_past): insert it directly, as history
  const pastRow = must(
    await admin.from('bookings').insert({ org_id: A.orgId, court_id: A.courtId, sport: 'padel', booker_profile_id: player.id, starts_at: inDays(-5), player_count: 4, payment_method: 'cash', status: 'completed' }).select('id').single(),
    'past booking'
  )
  created.bookings.push(pastRow.id)
  const future = await book(A, player.id, inDays(5))
  must(await admin.from('booking_notes').insert({ booking_id: pastRow.id, org_id: A.orgId, note: 'called from +21698111222' }), 'note')
  must(await admin.from('notifications').insert({ kind: 'booking_confirmation', booking_id: pastRow.id, recipient: player.email, subject: 'x', payload: { recipientName: 'Real player' } }), 'notification')

  // ================================================= soft delete: visibility
  const anon = client()
  const visible = async () => ({
    org: (await anon.from('organizations').select('id').eq('id', A.orgId)).data?.length ?? 0,
    court: (await anon.from('courts').select('id').eq('id', A.courtId)).data?.length ?? 0,
    locks: (await anon.from('court_slot_locks').select('court_id').eq('court_id', A.courtId)).data?.length ?? 0,
  })
  const before = await visible()
  check(before.org === 1 && before.court === 1 && before.locks >= 1, 'a live club, court and its slot locks are public', JSON.stringify(before))

  // ================================================= soft delete: a court with upcoming bookings cannot be archived
  const blocked = await admin.from('courts').update({ deleted_at: new Date().toISOString() }).eq('id', A.courtId)
  check(Boolean(blocked.error) && blocked.error.message.includes('has_upcoming_bookings'), 'a court with upcoming bookings cannot be archived', blocked.error?.message)

  // the owner cannot set deleted_at from a client at all (RLS: archiving is a server action)
  const clientArchive = await owner.sb.from('courts').update({ deleted_at: new Date().toISOString() }).eq('id', A.courtId).select('id')
  check(Boolean(clientArchive.error) || (clientArchive.data ?? []).length === 0, 'an owner cannot set deleted_at with a client session')

  // cancel the upcoming booking, then archive
  must(await admin.from('bookings').update({ status: 'cancelled', cancellation_reason: 'test' }).eq('id', future), 'cancel')
  check(!(await admin.from('court_slot_locks').select('booking_id').eq('booking_id', future)).data?.length, 'a cancelled booking frees its slot but the booking row stays')
  const stays = must(await admin.from('bookings').select('status').eq('id', future).single(), 'stays')
  check(stays.status === 'cancelled', 'the cancelled booking is kept with status cancelled')
  must(await admin.from('courts').update({ deleted_at: new Date().toISOString() }).eq('id', A.courtId), 'archive court')
  const afterCourt = await visible()
  check(afterCourt.court === 0 && afterCourt.locks === 0, 'an archived court (and its locks) disappears from the public', JSON.stringify(afterCourt))
  check(afterCourt.org === 1, 'the club itself is still public')
  const ownerSees = must(await owner.sb.from('courts').select('id, deleted_at').eq('id', A.courtId), 'owner sees')
  check(ownerSees.length === 1 && ownerSees[0].deleted_at, "the club's own staff can still read it (so old bookings keep their court name)")
  const book2 = await admin.rpc('create_booking', { p_org_id: A.orgId, p_court_id: A.courtId, p_sport: 'padel', p_starts_at: inDays(9), p_player_count: 4, p_amount: 60, p_profile_id: player.id })
  check(Boolean(book2.error) && book2.error.message.includes('invalid_court'), 'an archived court cannot be booked (database engine)', book2.error?.message)
  check((await admin.from('bookings').select('id').eq('court_id', A.courtId)).data.length >= 2, 'history on the archived court is intact')
  must(await admin.from('courts').update({ deleted_at: null }).eq('id', A.courtId), 'restore court')

  // ================================================= no hard delete
  const del = async (who, sb, table, id) => {
    const r = await sb.from(table).delete().eq('id', id).select('id')
    return { error: r.error?.message ?? null, rows: r.data?.length ?? 0 }
  }
  for (const [who, sb] of [['org_admin', owner.sb], ['player', player.sb], ['anon', anon]]) {
    const r = await del(who, sb, 'bookings', pastRow.id)
    check(r.rows === 0 && Boolean(r.error), `${who} cannot delete a booking`, JSON.stringify(r))
  }
  const delCourt = await del('org_admin', owner.sb, 'courts', A.courtId)
  check(delCourt.rows === 0 && Boolean(delCourt.error), 'an owner cannot delete a court', JSON.stringify(delCourt))
  const svcBooking = await admin.from('bookings').delete().eq('id', pastRow.id)
  check(Boolean(svcBooking.error) && svcBooking.error.message.includes('hard_delete_blocked'), 'even the service role cannot delete a booking directly', svcBooking.error?.message)
  const svcCourt = await admin.from('courts').delete().eq('id', A.courtId)
  check(Boolean(svcCourt.error) && svcCourt.error.message.includes('hard_delete_blocked'), 'a court with booking history cannot be deleted')
  const svcOrg = await admin.from('organizations').delete().eq('id', A.orgId)
  check(Boolean(svcOrg.error) && svcOrg.error.message.includes('hard_delete_blocked'), 'a club with booking history cannot be deleted (no cascading wipe)')
  const svcProfile = await admin.from('profiles').delete().eq('id', player.id)
  check(Boolean(svcProfile.error) && svcProfile.error.message.includes('hard_delete_blocked'), 'a player with booking history cannot be deleted')
  const svcAuth = await admin.auth.admin.deleteUser(player.id)
  check(Boolean(svcAuth.error), 'deleting the auth user of a player with history is refused too', svcAuth.error?.message)
  check((await admin.from('bookings').select('id').eq('id', pastRow.id)).data.length === 1, 'the booking is still there after all those attempts')

  // ================================================= anonymization
  const nonPlayer = await admin.rpc('anonymize_player', { p_user_id: owner.id })
  check(Boolean(nonPlayer.error) && nonPlayer.error.message.includes('not_a_player'), 'an owner cannot be anonymized through the player workflow')
  // a second upcoming booking, to prove it is cancelled and the slot freed
  const upcoming = await book(A, player.id, inDays(7))
  const res = must(await admin.rpc('anonymize_player', { p_user_id: player.id }), 'anonymize')
  check(res.bookings_kept === 3 && res.bookings_cancelled === 1, 'anonymization keeps all bookings and cancels the upcoming one', JSON.stringify(res))
  const prof = must(await admin.from('profiles').select('display_name, phone, avatar_url, anonymized_at, no_show_count, trust_score, role').eq('id', player.id).single(), 'profile')
  check(prof.display_name === 'Joueur Anonyme' && prof.phone === null && prof.avatar_url === null && prof.anonymized_at, 'the profile is anonymous (Joueur Anonyme, no phone)', JSON.stringify(prof))
  check(prof.no_show_count === 1 && prof.trust_score === 70, 'no-show count and trust score are kept as anonymous statistics')
  const au = must(await admin.auth.admin.getUserById(player.id), 'auth user').user
  check(au.email === `deleted_${player.id}@shiftgrid.invalid` && !au.phone && Object.keys(au.user_metadata ?? {}).length === 0, 'the login email is replaced and the metadata erased', JSON.stringify({ email: au.email, meta: au.user_metadata }))
  check((au.identities ?? []).length === 0, 'the login identities are removed')
  const old = await client().auth.signInWithPassword({ email: player.email, password: PASSWORD })
  check(Boolean(old.error), 'the old credentials no longer sign in')
  const reuse = await client().auth.signInWithPassword({ email: `deleted_${player.id}@shiftgrid.invalid`, password: PASSWORD })
  check(Boolean(reuse.error), 'the anonymized account cannot be signed in to')
  const upBooking = must(await admin.from('bookings').select('status').eq('id', upcoming).single(), 'upcoming')
  check(upBooking.status === 'cancelled' && !(await admin.from('court_slot_locks').select('booking_id').eq('booking_id', upcoming)).data?.length, 'the upcoming booking was cancelled and its slot released')
  check((await admin.from('bookings').select('id').eq('booker_profile_id', player.id)).data.length === 3, 'every booking still points at the (anonymous) player')
  check(!(await admin.from('booking_notes').select('note').eq('booking_id', pastRow.id)).data?.length, 'staff notes about the player were erased')
  const notif = must(await admin.from('notifications').select('recipient, payload').eq('booking_id', pastRow.id), 'notif')
  check(notif.every((n) => n.recipient === 'deleted@shiftgrid.invalid' && n.payload === null), 'notification records lost the address and payload')
  const again = await admin.rpc('anonymize_player', { p_user_id: player.id })
  check(Boolean(again.error) && again.error.message.includes('already_anonymized'), 'anonymizing twice is refused')

  // a guest
  const g = must(await admin.from('anonymous_bookers').insert({ org_id: A.orgId, name: `${tag} Guest`, phone: '+21698999888', email: 'guest@example.com' }).select('id').single(), 'guest')
  const gb = must(await admin.from('bookings').insert({ org_id: A.orgId, court_id: A.courtId, sport: 'padel', booker_anon_id: g.id, starts_at: inDays(-3), player_count: 4, payment_method: 'cash', status: 'completed', guest_cancel_token_hash: 'abc' }).select('id').single(), 'guest booking')
  created.bookings.push(gb.id)
  must(await admin.rpc('anonymize_guest', { p_guest_id: g.id }), 'anonymize guest')
  const gr = must(await admin.from('anonymous_bookers').select('name, phone, email').eq('id', g.id).single(), 'guest row')
  check(gr.name === 'Joueur Anonyme' && gr.phone === null && gr.email === null, 'a guest can be anonymized too (booking history stays)')
  check((await admin.from('bookings').select('guest_cancel_token_hash').eq('id', gb.id).single()).data.guest_cancel_token_hash === null, "the guest's secret cancel link was revoked")

  // ================================================= archive / restore a club
  const B = await org('Beta')
  const guestB = must(await admin.rpc('create_booking', { p_org_id: B.orgId, p_court_id: B.courtId, p_sport: 'padel', p_starts_at: inDays(6), p_player_count: 4, p_amount: 60, p_guest_name: `${tag} G2`, p_guest_phone: '+21698777666' }), 'guest booking B')
  created.bookings.push(guestB.booking_id)
  const refuse = await admin.rpc('archive_organization', { p_org_id: B.orgId, p_cancel_upcoming: false })
  check(Boolean(refuse.error) && refuse.error.message.includes('has_upcoming_bookings:1'), 'archiving a club with upcoming bookings is refused until confirmed', refuse.error?.message)
  const arch = must(await admin.rpc('archive_organization', { p_org_id: B.orgId, p_cancel_upcoming: true }), 'archive org')
  check(arch.cancelled_booking_ids.length === 1, 'confirmed archive cancels the upcoming booking and reports it (for the emails)')
  const pubB = {
    org: (await anon.from('organizations').select('id').eq('id', B.orgId)).data.length,
    court: (await anon.from('courts').select('id').eq('id', B.courtId)).data.length,
    list: (await anon.from('organizations').select('id').eq('status', 'approved').like('name', `${tag}%`)).data.map((o) => o.id),
  }
  check(pubB.org === 0 && pubB.court === 0 && !pubB.list.includes(B.orgId), 'an archived club is gone from the public listing')
  check((await admin.from('bookings').select('id').eq('org_id', B.orgId)).data.length >= 1, 'the archived club keeps its bookings')
  const plainDelete = await admin.from('organizations').delete().eq('id', B.orgId)
  check(Boolean(plainDelete.error), 'an archived club still cannot be hard-deleted while it has history')
  must(await admin.rpc('restore_organization', { p_org_id: B.orgId }), 'restore org')
  check((await anon.from('organizations').select('id').eq('id', B.orgId)).data.length === 1 && (await anon.from('courts').select('id').eq('id', B.courtId)).data.length === 1, 'a restored club and its courts are public again')

  // ================================================= the maintenance door
  const purged = must(await admin.rpc('purge_bookings', { p_ids: created.bookings }), 'purge')
  check(purged >= 5, 'purge_bookings (maintenance only) removes test bookings and their children', String(purged))
  check(!(await client().rpc('purge_bookings', { p_ids: created.bookings })).data, 'the maintenance function is not callable from a client')
} catch (e) {
  console.error('Verify crashed:', e.message ?? e)
  failures++
} finally {
  await cleanup().catch((e) => console.log('CLEANUP ERROR', e.message))
  const left = await admin.from('organizations').select('id', { count: 'exact', head: true }).like('name', `${tag}%`)
  console.log(`\nfixtures removed (leftover test clubs: ${left.count})`)
}
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed')
process.exit(failures ? 1 : 0)
