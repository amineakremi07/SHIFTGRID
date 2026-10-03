import { cleanupE2E } from './helpers/db'

export default async function globalTeardown() {
  await cleanupE2E()
}
