import { execFileSync } from 'node:child_process'

import { cleanupE2E } from './helpers/db'
import { applyTestDatabaseEnv, assertSeedingAllowed } from './helpers/test-env'

/**
 * Seed the four role accounts and the test club (idempotent), and clear leftovers of an aborted run.
 *
 * Seeding writes accounts with a KNOWN password (including a platform admin), so it only runs against a
 * dedicated test project (TEST_SUPABASE_*, see helpers/test-env.ts), or one you explicitly approve with
 * E2E_ALLOW_SHARED_DB=1. Pure specs (validation, templates, club-profile, anti-no-show) need
 * none of it: run them with `E2E_SKIP_SEED=1 npx playwright test tests/<file>` so nothing is created.
 */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return
  applyTestDatabaseEnv()
  assertSeedingAllowed()
  execFileSync(process.execPath, ['scripts/seed-all-roles.mjs'], { stdio: 'ignore' })
  await cleanupE2E()
}
