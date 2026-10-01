#!/usr/bin/env node
/**
 * Create or promote a platform admin for testing the verification portal.
 *
 *   node scripts/seed-platform-admin.mjs                       # admin@shiftgrid.local, random password
 *   node scripts/seed-platform-admin.mjs you@example.com       # another email
 *   ADMIN_SEED_PASSWORD='S0me-long-pass' node scripts/seed-platform-admin.mjs
 *
 * Idempotent. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the
 * SECRET key) in .env.local. The password is only set when the account is
 * created; an existing account keeps its password (pass ADMIN_SEED_PASSWORD with
 * --reset-password to change it).
 *
 * profiles.org_id is NOT NULL, so the admin is attached to a hidden
 * "ShiftGrid Platform" organization. Its status is `suspended` on purpose: it
 * must never show up in the public club list or the player-signup club dropdown.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PLATFORM_ORG_NAME = 'ShiftGrid Platform'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env.local is optional if the variables are already exported */
  }
  return env
}

const env = loadEnv()
const args = process.argv.slice(2)
const resetPassword = args.includes('--reset-password')
const email = (args.find((a) => !a.startsWith('--')) ?? 'admin@shiftgrid.local').toLowerCase()
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

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  // 1. The hidden platform organization.
  let { data: org, error } = await admin
    .from('organizations')
    .select('id')
    .eq('name', PLATFORM_ORG_NAME)
    .eq('status', 'suspended')
    .maybeSingle()
  if (error) throw error
  if (!org) {
    ;({ data: org, error } = await admin
      .from('organizations')
      .insert({ name: PLATFORM_ORG_NAME, status: 'suspended', city: null, sport_types: [] })
      .select('id')
      .single())
    if (error) throw error
  }

  // 2. The auth user.
  let user = await findUserByEmail(email)
  let password = env.ADMIN_SEED_PASSWORD
  let createdPassword = null
  if (!user) {
    password = password || randomBytes(12).toString('base64url')
    const res = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Platform Admin' },
    })
    if (res.error) throw res.error
    user = res.data.user
    createdPassword = password
  } else if (resetPassword && password) {
    const res = await admin.auth.admin.updateUserById(user.id, { password })
    if (res.error) throw res.error
    createdPassword = password
  }

  // 3. The profile: create or promote.
  const { error: profileError } = await admin.from('profiles').upsert(
    { id: user.id, org_id: org.id, role: 'platform_admin', display_name: 'Platform Admin' },
    { onConflict: 'id' }
  )
  if (profileError) throw profileError

  console.log(`\nPlatform admin ready: ${email}`)
  console.log(createdPassword ? `Password: ${createdPassword}` : 'Password: unchanged (existing account)')
  console.log('Log in at /login-owner; you are redirected to /admin/verification.\n')
}

main().catch((e) => {
  console.error('Seed failed:', e.message ?? e)
  process.exit(1)
})
