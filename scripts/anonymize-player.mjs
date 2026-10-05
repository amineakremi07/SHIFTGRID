#!/usr/bin/env node
/**
 * Handle a "delete my data" request by hand (the privacy page says requests can also be made by
 * email). It runs the SAME workflow as the player's "Delete my account" button
 * (public.anonymize_player): the person is erased, the booking history stays.
 *
 *   node scripts/anonymize-player.mjs <email-or-user-id>            show what would happen (dry run)
 *   node scripts/anonymize-player.mjs <email-or-user-id> --yes      do it
 *   node scripts/anonymize-player.mjs --guest <phone-or-id> [--yes]  erase a guest booker instead
 *
 * Uses the service role from .env.local, so run it deliberately and only for an identified requester.
 * Nothing is deleted: this is the only supported way to remove a player, because a player with booking
 * history cannot be hard-deleted (a database guard refuses it).
 */
import { readFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'

const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  /* variables may be exported instead */
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false } })

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const guest = args.includes('--guest')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error('Usage: node scripts/anonymize-player.mjs <email-or-user-id> [--yes]\n       node scripts/anonymize-player.mjs --guest <phone-or-id> [--yes]')
  process.exit(1)
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findUserId(value) {
  if (UUID.test(value)) return value
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === value.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

if (guest) {
  const q = UUID.test(target) ? admin.from('anonymous_bookers').select('id, org_id, name, phone').eq('id', target) : admin.from('anonymous_bookers').select('id, org_id, name, phone').eq('phone', target)
  const { data: rows, error } = await q
  if (error) throw error
  if (!rows?.length) {
    console.error('No guest booker found.')
    process.exit(1)
  }
  for (const g of rows) {
    const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true }).eq('booker_anon_id', g.id)
    console.log(`Guest ${g.id} (club ${g.org_id}): ${count} booking(s) would be kept anonymously; upcoming ones cancelled.`)
    if (!yes) continue
    const { data, error: e } = await admin.rpc('anonymize_guest', { p_guest_id: g.id })
    console.log(e ? `  FAILED: ${e.message}` : `  done: ${JSON.stringify(data)}`)
  }
  if (!yes) console.log('\nDry run only. Add --yes to erase.')
  process.exit(0)
}

const id = await findUserId(target)
if (!id) {
  console.error('No account found for that email / id.')
  process.exit(1)
}
const { data: profile } = await admin.from('profiles').select('role, org_id, anonymized_at, no_show_count, trust_score').eq('id', id).maybeSingle()
if (!profile) {
  console.error('That account has no ShiftGrid profile.')
  process.exit(1)
}
if (profile.role !== 'player') {
  console.error(`That account is a ${profile.role}, not a player: clubs and staff are not removed with this tool.`)
  process.exit(1)
}
if (profile.anonymized_at) {
  console.error('That account was already anonymized.')
  process.exit(1)
}
const { count: total } = await admin.from('bookings').select('id', { count: 'exact', head: true }).eq('booker_profile_id', id)
const { count: upcoming } = await admin
  .from('bookings')
  .select('id', { count: 'exact', head: true })
  .eq('booker_profile_id', id)
  .in('status', ['pending_payment', 'confirmed'])
  .gt('ends_at', new Date().toISOString())
console.log(`Player ${id}: ${total} booking(s) kept anonymously, ${upcoming} upcoming one(s) cancelled, no-shows ${profile.no_show_count}, trust ${profile.trust_score} kept.`)
console.log('Erased: name, phone, avatar, login email and password, identities and sessions, staff notes and notification addresses of their bookings.')
if (!yes) {
  console.log('\nDry run only. Add --yes to erase.')
  process.exit(0)
}
const { data, error } = await admin.rpc('anonymize_player', { p_user_id: id })
if (error) {
  console.error('FAILED:', error.message)
  process.exit(1)
}
console.log('Done:', JSON.stringify(data))
