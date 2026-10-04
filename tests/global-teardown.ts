import { cleanupE2E } from './helpers/db'

export default async function globalTeardown() {
  if (process.env.E2E_SKIP_SEED === '1') return
  await cleanupE2E()
}
