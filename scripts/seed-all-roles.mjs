#!/usr/bin/env node
/**
 * Provision one dev account per role, plus the club they belong to.
 *
 *   node scripts/seed-all-roles.mjs
 *   SEED_PASSWORD='Another-Pass-1!' node scripts/seed-all-roles.mjs
 *
 * | Email                    | Role           | Club             | Signs in at    | Lands on                 |
 * |--------------------------|----------------|------------------|----------------|--------------------------|
 * | admin@shiftgrid.local    | platform_admin | (hidden platform)| /login-owner   | /admin/verification      |
 * | owner@shiftgrid.local    | org_admin      | ShiftGrid Test Club | /login-owner | /dashboard/org (bookings)|
 * | staff@shiftgrid.local    | staff          | ShiftGrid Test Club | /login-owner | /dashboard/org/bookings  |
 * | player@shiftgrid.local   | player         | ShiftGrid Test Club | sign-in modal | /reservations           |
 *
 * Idempotent: re-running reuses the organizations and accounts, re-asserts each
 * role/club link, and resets every password to the shared dev password, so the
 * credentials printed at the end are always the working ones.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the SECRET key)
 * in .env.local. This project has no local Supabase (Docker conflicts on the dev
 * machine), so the target is the hosted project: the URL is printed first, and
 * the script refuses to run with NODE_ENV=production.
 *
 * profiles.org_id is NOT NULL, so every role, the platform admin and players
 * included, belongs to a club. The platform admin's is the hidden
 * "ShiftGrid Platform" org (status `suspended`, never listed publicly).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_PASSWORD = 'ShiftGrid-Dev-1!'
const PLATFORM_ORG = 'ShiftGrid Platform'
const TEST_CLUB = 'ShiftGrid Test Club'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env.local is optional when the variables are exported */
  }
  return env
}

const env = loadEnv()
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed test accounts with NODE_ENV=production.')
  process.exit(1)
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).')
  process.exit(1)
}
if (key.startsWith('sb_publishable_') || key === env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is the publishable/anon key. Use the secret key (Dashboard > Project Settings > API Keys).')
  process.exit(1)
}
const password = env.SEED_PASSWORD || DEFAULT_PASSWORD
if (password.length < 8) {
  console.error('SEED_PASSWORD must be at least 8 characters.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function ensureOrg(name, fields) {
  const existing = must(await admin.from('organizations').select('id').eq('name', name).limit(1), `find ${name}`)
  if (existing.length) {
    must(await admin.from('organizations').update(fields).eq('id', existing[0].id), `update ${name}`)
    return existing[0].id
  }
  return must(await admin.from('organizations').insert({ name, ...fields }).select('id').single(), `create ${name}`).id
}

async function ensureCourt(orgId, court) {
  const existing = must(
    await admin.from('courts').select('id').eq('org_id', orgId).eq('name', court.name).limit(1),
    `find ${court.name}`
  )
  if (existing.length) return
  must(await admin.from('courts').insert({ org_id: orgId, status: 'active', open_time: '08:00', close_time: '00:00', ...court }), `create ${court.name}`)
}

async function ensureAccount({ email, role, orgId, displayName, phone }) {
  let user = await findUserByEmail(email)
  if (!user) {
    const res = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
    if (res.error) throw new Error(`create ${email}: ${res.error.message}`)
    user = res.data.user
  } else {
    const res = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
    if (res.error) throw new Error(`reset ${email}: ${res.error.message}`)
  }
  // Service-role upsert: the only path allowed to set role/org_id (clients cannot).
  must(
    await admin
      .from('profiles')
      .upsert({ id: user.id, org_id: orgId, role, display_name: displayName, phone: phone ?? null }, { onConflict: 'id' }),
    `profile ${email}`
  )
  return user.id
}

async function main() {
  console.log(`Seeding ${url}\n`)

  const platformOrg = await ensureOrg(PLATFORM_ORG, { status: 'suspended', city: null, sport_types: [] })
  const clubId = await ensureOrg(TEST_CLUB, {
    status: 'approved',
    address: '1 Avenue Habib Bourguiba, Tunis',
    city: 'Tunis',
    latitude: 36.8008,
    longitude: 10.1815,
    sport_types: ['padel', 'tennis'],
    timezone: 'Africa/Tunis',
  })
  await ensureCourt(clubId, { name: 'Padel Court 1', sport: 'padel', price_per_hour: 60, night_surcharge_per_hour: 10, night_starts_at: '19:00' })
  await ensureCourt(clubId, { name: 'Tennis Court 1', sport: 'tennis', price_per_hour: 30 })

  const accounts = [
    { email: 'admin@shiftgrid.local', role: 'platform_admin', orgId: platformOrg, displayName: 'Platform Admin' },
    { email: 'owner@shiftgrid.local', role: 'org_admin', orgId: clubId, displayName: 'Test Owner', phone: '+21620000001' },
    { email: 'staff@shiftgrid.local', role: 'staff', orgId: clubId, displayName: 'Test Staff', phone: '+21620000002' },
    { email: 'player@shiftgrid.local', role: 'player', orgId: clubId, displayName: 'Test Player', phone: '+21620000003' },
  ]
  for (const a of accounts) {
    await ensureAccount(a)
    console.log(`  ok  ${a.role.padEnd(14)} ${a.email}`)
  }

  console.log(`
Password for all four accounts: ${password}

  platform_admin  /login-owner  -> /admin/verification
  org_admin       /login-owner  -> /dashboard/org (bookings; also Analytics, Courts, Hours, Team)
  staff           /login-owner  -> /dashboard/org/bookings (staff cannot open Team/Courts/Hours/Analytics)
  player          sign-in modal -> /reservations   (/login-owner refuses players by design)

Test club: "${TEST_CLUB}" (approved, 2 courts)
`)
}

main().catch((e) => {
  console.error('Seed failed:', e.message ?? e)
  process.exit(1)
})
