import { execFileSync } from 'node:child_process'

import { cleanupE2E } from './helpers/db'

/** Seed the four role accounts and the test club (idempotent), and clear leftovers of an aborted run. */
export default async function globalSetup() {
  execFileSync(process.execPath, ['scripts/seed-all-roles.mjs'], { stdio: 'ignore' })
  await cleanupE2E()
}
