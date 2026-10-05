import { existsSync, readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { AUTH_PATHS, AUTH_REDIRECT_PATHS, LOCAL_ORIGIN, requiredAuthRedirectUrls } from '../lib/auth-urls'

/**
 * Keeps every copy of the Supabase Auth redirect URLs identical and the code that depends on them honest.
 * Pure: reads source files only (no browser, no database, no network).
 */

const read = (path: string) => readFileSync(path, 'utf8')
const PROD = 'https://shiftgrid-eight.vercel.app'

test.describe('the redirect URL list', () => {
  test('is the three paths, for the app origin and for localhost', () => {
    expect(AUTH_REDIRECT_PATHS).toEqual(['/auth/callback', '/accept-invitation', '/reset-password'])
    expect(requiredAuthRedirectUrls(PROD)).toEqual([
      `${PROD}/auth/callback`,
      `${PROD}/accept-invitation`,
      `${PROD}/reset-password`,
      'http://localhost:3000/auth/callback',
      'http://localhost:3000/accept-invitation',
      'http://localhost:3000/reset-password',
    ])
    expect(requiredAuthRedirectUrls(`${PROD}/`)).toEqual(requiredAuthRedirectUrls(PROD)) // trailing slash tolerated
    expect(requiredAuthRedirectUrls(LOCAL_ORIGIN)).toHaveLength(3) // no duplicates when the app IS localhost
  })

  test('every path is a real route of the app', () => {
    expect(existsSync('app/auth/callback/route.ts')).toBe(true)
    expect(existsSync('app/accept-invitation/page.tsx')).toBe(true)
    expect(existsSync('app/reset-password/page.tsx')).toBe(true)
  })
})

test.describe('supabase/config.toml', () => {
  const toml = read('supabase/config.toml')
  const urls = (toml.match(/additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"'))
    .map((l) => l.replace(/[",]/g, ''))

  test('lists exactly the required URLs (the app origin is the production site)', () => {
    expect(urls.sort()).toEqual(requiredAuthRedirectUrls(PROD).sort())
  })

  test('the Site URL is the production origin, not a local scaffold value', () => {
    expect(toml).toMatch(/^site_url = "https:\/\/shiftgrid-eight\.vercel\.app"$/m)
  })

  test('does not declare hosted settings it does not manage (a `config push` must not rewrite them)', () => {
    // Each of these differed from the hosted project (`supabase config diff`); they must stay commented out.
    const unmanaged: [section: string, key: string][] = [
      ['[db.pooler]', 'default_pool_size'],
      ['[db.pooler]', 'max_client_conn'],
      ['[storage.vector]', 'enabled'],
      ['[storage.vector]', 'max_buckets'],
      ['[storage.vector]', 'max_indexes'],
      ['[auth]', 'password_requirements'],
      ['[auth.email]', 'max_frequency'],
      ['[auth.email]', 'otp_length'],
      ['[auth.sms.twilio]', 'enabled'],
      ['[auth.mfa.totp]', 'enroll_enabled'],
      ['[auth.mfa.totp]', 'verify_enabled'],
    ]
    // active (uncommented) keys per section
    const active = new Map<string, Set<string>>()
    let section = ''
    for (const raw of toml.split(/\r?\n/)) {
      const line = raw.trim()
      if (/^\[[^\]]+\]$/.test(line)) section = line
      else if (/^[A-Za-z_]+\s*=/.test(line)) (active.get(section) ?? active.set(section, new Set()).get(section)!).add(line.split('=')[0].trim())
    }
    for (const [sec, key] of unmanaged) expect(active.get(sec)?.has(key) ?? false, `${sec} ${key} must stay commented out`).toBe(false)
    // and the two it does manage are active
    expect(active.get('[auth]')?.has('site_url')).toBe(true)
    expect(active.get('[auth]')?.has('additional_redirect_urls')).toBe(true)
  })
})

test.describe('the other copies', () => {
  test('.env.local.example documents every URL and the push/verify commands', () => {
    const example = read('.env.local.example')
    for (const path of AUTH_REDIRECT_PATHS) expect(example).toContain(path)
    expect(example).toContain('http://localhost:3000/auth/callback')
    expect(example).toContain('supabase config diff')
    expect(example).toContain('supabase config push')
    expect(example).toContain('npm run verify:auth-urls')
  })

  test('the verify script and package.json agree with lib/auth-urls.ts', () => {
    const script = read('scripts/verify-auth-redirects.mjs')
    expect(script).toContain(`const PATHS = ${JSON.stringify([...AUTH_REDIRECT_PATHS]).replace(/"/g, "'").replace(/,/g, ', ')}`)
    expect(script).toContain(`const LOCAL_ORIGIN = '${LOCAL_ORIGIN}'`)
    expect(JSON.parse(read('package.json')).scripts['verify:auth-urls']).toBe('node scripts/verify-auth-redirects.mjs')
  })
})

test.describe('the code that asks for, or handles, those redirects', () => {
  test('sign-up confirmation sends people to /auth/callback on the request origin', () => {
    const src = read('lib/actions/player-auth.ts')
    expect(src).toContain('emailRedirectTo: `${await requestOrigin()}${AUTH_PATHS.callback}`')
    expect(src).not.toContain('NEXT_PUBLIC_APP_URL}/auth/callback') // the old form that printed "undefined/auth/callback"
  })

  test('/forgot-password redirects to /reset-password on the browser origin', () => {
    expect(read('components/auth/forgot-password-form.tsx')).toContain('redirectTo: `${window.location.origin}${AUTH_PATHS.resetPassword}`')
  })

  test('/auth/callback reads token_hash + type, code and next, and hands off to the other two paths', () => {
    const pure = read('lib/auth-callback.ts')
    for (const param of ["'token_hash'", "'type'", "'code'", "'next'"]) expect(pure).toContain(`params.get(${param})`)
    expect(pure).toContain('AUTH_PATHS.resetPassword')
    expect(pure).toContain('AUTH_PATHS.acceptInvitation')
    const route = read('app/auth/callback/route.ts')
    expect(route).toContain('verifyOtp({ token_hash: decision.tokenHash, type: decision.type })')
    expect(route).toContain('exchangeCodeForSession(decision.code)')
  })

  test('the app\'s own staff invitation is /accept-invite?token= (never through Supabase), and /accept-invitation forwards that token', () => {
    expect(read('lib/actions/staff-invites.ts')).toContain('/accept-invite?token=${args.token}')
    expect(read('app/accept-invitation/page.tsx')).toContain('redirect(`/accept-invite?token=${token}`)')
  })

  test('paths are used through AUTH_PATHS, never hard-coded in the places that request a redirect', () => {
    expect(AUTH_PATHS.callback).toBe('/auth/callback')
    expect(AUTH_PATHS.acceptInvitation).toBe('/accept-invitation')
    expect(AUTH_PATHS.resetPassword).toBe('/reset-password')
  })
})
