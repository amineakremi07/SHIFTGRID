#!/usr/bin/env node
/**
 * Removes everything the load tests created: guest bookers named "K6 LOAD ..." / "LOAD BENCH ...",
 * their bookings, payment records and slot locks. Uses the service role from .env.local.
 *
 *   node scripts/cleanup-load-test.mjs            # delete
 *   node scripts/cleanup-load-test.mjs --dry-run  # count only
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = { ...process.env }
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const dry = process.argv.includes('--dry-run')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const fail = (what, error) => {
  console.error(`${what}: ${error.message}`)
  process.exit(1)
}

const { data: bookers, error: e1 } = await db
  .from('anonymous_bookers')
  .select('id')
  .or('name.like.K6 LOAD%,name.like.LOAD BENCH%')
if (e1) fail('anonymous_bookers', e1)
const bookerIds = bookers.map((b) => b.id)

let bookingIds = []
for (let i = 0; i < bookerIds.length; i += 100) {
  const { data, error } = await db.from('bookings').select('id').in('booker_anon_id', bookerIds.slice(i, i + 100))
  if (error) fail('bookings', error)
  bookingIds.push(...data.map((b) => b.id))
}
console.log(`${bookerIds.length} load-test guests, ${bookingIds.length} bookings`)
if (dry || !bookerIds.length) process.exit(0)

for (let i = 0; i < bookingIds.length; i += 100) {
  const ids = bookingIds.slice(i, i + 100)
  for (const [table, col] of [['booking_shares', 'booking_id'], ['payment_records', 'booking_id'], ['notifications', 'booking_id'], ['court_slot_locks', 'booking_id'], ['bookings', 'id']]) {
    // Bookings are never hard-deleted: load-test rows go through the maintenance function.
    const { error } = table === 'bookings' ? await db.rpc('purge_bookings', { p_ids: ids }) : await db.from(table).delete().in(col, ids)
    // A table without that column (or already cascaded) is fine; anything else is not.
    if (error && !/column|relation|does not exist/i.test(error.message)) fail(table, error)
  }
}
for (let i = 0; i < bookerIds.length; i += 100) {
  const { error } = await db.from('anonymous_bookers').delete().in('id', bookerIds.slice(i, i + 100))
  if (error) fail('anonymous_bookers delete', error)
}
console.log('removed')
