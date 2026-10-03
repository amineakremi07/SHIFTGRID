import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests. They drive a real browser against the dev server and the
 * hosted Supabase project in .env.local (there is no local Supabase here), using
 * the seeded "ShiftGrid Test Club" accounts. Test bookings are made under guest
 * names starting with "E2E " and removed before and after the run.
 *
 *   npx playwright test tests/booking-flow.spec.ts
 *
 * Browser: Playwright's own build when installed (`npx playwright install
 * chromium`); otherwise the newest Chromium already in the Playwright cache, or
 * PLAYWRIGHT_CHROMIUM_PATH if set.
 */
function cachedChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!existsSync(cache)) return undefined
  const builds = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()
  for (const build of builds) {
    const exe = join(cache, build, 'chrome-win64', 'chrome.exe')
    if (existsSync(exe)) return exe
  }
  return undefined
}

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  // One worker: the tests share one club and book real (future) slots.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: cachedChromium() },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
    // Tests never contact the email provider (whatever key .env holds): emails are
    // rendered and recorded in the outbox as "skipped". A server you start yourself and
    // reuse should be started with EMAIL_DRY_RUN=1 too.
    env: { EMAIL_DRY_RUN: '1', RATE_LIMIT_DISABLED: '1' },
  },
})
