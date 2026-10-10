/**
 * Which Supabase project the end-to-end tests may seed.
 *
 * The seed writes accounts with a KNOWN password (including a platform admin) and a test club, so it must
 * never run against a project that serves real users. The tests therefore read a DEDICATED project from
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY
 * and map it onto the standard variable names for the runner, the seed scripts and the dev server.
 * Without them, seeding is refused unless E2E_ALLOW_SHARED_DB=1 (a throwaway development project that
 * `.env.local` points at). Pure specs need neither: run them with E2E_SKIP_SEED=1.
 */
const PAIRS = [
  ['TEST_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  ['TEST_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ['TEST_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
] as const

export function usesDedicatedTestDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TEST_SUPABASE_URL)
}

/** Point every process the run starts (workers, seed scripts, `next dev`) at the test project. */
export function applyTestDatabaseEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!usesDedicatedTestDatabase(env)) return
  const missing = PAIRS.filter(([from]) => !env[from]).map(([from]) => from)
  if (missing.length) throw new Error(`TEST_SUPABASE_URL is set but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing.`)
  for (const [from, to] of PAIRS) env[to] = env[from]
}

/** Throws unless seeding has an explicitly approved target. */
export function assertSeedingAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (usesDedicatedTestDatabase(env) || env.E2E_ALLOW_SHARED_DB === '1') return
  throw new Error(
    'Refusing to seed test accounts: no dedicated test database. Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and ' +
      'TEST_SUPABASE_SERVICE_ROLE_KEY (a separate Supabase project), or set E2E_ALLOW_SHARED_DB=1 if .env.local ' +
      'points at a throwaway development project. Pure specs: E2E_SKIP_SEED=1.'
  )
}
