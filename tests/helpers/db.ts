import { readFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'

/** .env.local values (plus anything already exported); the service key is needed to seed and clean up. */
export function loadEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* variables may be exported instead */
  }
  return env
}

export function adminClient() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** The seeded club every test books at. */
export async function getTestClubId(): Promise<string> {
  const { data, error } = await adminClient().from('organizations').select('id').eq('name', 'ShiftGrid Test Club').single()
  if (error || !data) throw new Error('ShiftGrid Test Club not found: run `node scripts/seed-all-roles.mjs`')
  return data.id
}

/** Remove every booking and guest the tests created (guest names start with "E2E "). */
export async function cleanupE2E(): Promise<number> {
  const admin = adminClient()
  const { data: guests } = await admin.from('anonymous_bookers').select('id').like('name', 'E2E %')
  const ids = (guests ?? []).map((g) => g.id)
  if (!ids.length) return 0
  await admin.from('bookings').delete().in('booker_anon_id', ids)
  await admin.from('anonymous_bookers').delete().in('id', ids)
  return ids.length
}

/** YYYY-MM-DD, `n` days from today (UTC date is close enough for a far-future slot). */
export function daysFromNow(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The outbox rows of one booking, oldest first. */
export async function outboxFor(bookingId: string) {
  const { data, error } = await adminClient()
    .from('notifications')
    .select('id, kind, recipient, subject, status, attempts, last_error, payload, dedupe_key')
    .eq('booking_id', bookingId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Poll until `done(rows)` (emails are sent after the response, so they land a moment later). */
export async function waitForOutbox<T>(
  bookingId: string,
  done: (rows: Awaited<ReturnType<typeof outboxFor>>) => T | false,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await outboxFor(bookingId)
    const result = done(rows)
    if (result) return result
    if (Date.now() > deadline) throw new Error(`outbox did not reach the expected state: ${JSON.stringify(rows)}`)
    await new Promise((r) => setTimeout(r, 500))
  }
}
