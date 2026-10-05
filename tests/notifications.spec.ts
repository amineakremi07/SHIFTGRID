import { expect, test, type Page } from '@playwright/test'

import {
  cancellationEmail,
  confirmationEmail,
  reminderEmail,
  splitInviteEmail,
  type BookingFacts,
} from '../lib/notifications/templates'
import { venueDateString } from '../lib/court-time'
import { adminClient, daysFromNow, getTestClubId, loadEnv, outboxFor, waitForOutbox } from './helpers/db'

/**
 * Milestone 10: transactional emails, the outbox, the reminder cron and the live
 * staff alerts. Real browser, real database (see playwright.config.ts).
 *
 * No email provider key is configured in development, so delivery shows up as
 * `skipped` in the outbox: the tests prove what would be sent, to whom, once, and
 * that nothing secret is stored. A configured provider would give `sent`.
 */

test.describe.configure({ mode: 'serial' })

const TOKEN = /[0-9a-f]{48}/
const DELIVERY_OK = ['sent', 'skipped']

let clubId: string
test.beforeAll(async () => {
  clubId = await getTestClubId()
})

const facts: BookingFacts = {
  clubName: 'Padel Tunis',
  courtName: 'Court 1',
  sport: 'padel',
  date: 'Tue 3 Nov 2026',
  time: '18:00 – 19:30',
  reference: 'ABCD1234',
  amount: 90,
  playerCount: 4,
}

/* ---------------------------------- templates --------------------------------- */

test('templates: user text is escaped, links are our own, text parts exist', () => {
  const hostile = '<script>alert(1)</script> & "quotes"'
  const mails = [
    confirmationEmail({
      ...facts,
      recipientName: hostile,
      state: 'confirmed',
      paidNow: 90,
      passUrl: 'https://shiftgrid.test/reservations/abc',
      cancelUrl: 'https://shiftgrid.test/reservations/cancel-guest?token=x',
      invitesEmailed: 0,
    }),
    splitInviteEmail({ ...facts, clubName: hostile, organizerName: hostile, share: 22.5, joinUrl: 'https://shiftgrid.test/join?token=y' }),
    cancellationEmail({ ...facts, recipientName: hostile, reason: hostile, refundAmount: 90, cancelledBy: 'you' }),
    reminderEmail({ ...facts, recipientName: hostile, state: 'pay_at_club', dueAtClub: 90, unpaidShares: 0, passUrl: null }),
  ]
  for (const m of mails) {
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
    expect(m.subject.length).toBeGreaterThan(5)
    expect(m.text.length).toBeGreaterThan(20)
  }
  // A link that is not http(s) never becomes an href.
  const bad = confirmationEmail({
    ...facts,
    recipientName: 'A',
    state: 'confirmed',
    paidNow: 90,
    passUrl: 'javascript:alert(1)',
    cancelUrl: null,
    invitesEmailed: 0,
  })
  expect(bad.html).not.toContain('javascript:')
})

test('templates: each email says what the recipient needs', () => {
  const split = splitInviteEmail({ ...facts, organizerName: 'Ali', share: 22.5, joinUrl: 'https://shiftgrid.test/join?token=y' })
  expect(split.subject).toContain('Ali invited you')
  expect(split.html).toContain('href="https://shiftgrid.test/join?token=y"')
  expect(split.html).toContain('22.50 TND')

  const refunded = cancellationEmail({ ...facts, recipientName: 'Sam', reason: null, refundAmount: 90, cancelledBy: 'club' })
  expect(refunded.html).toContain('refund of 90 TND')
  expect(refunded.html).toContain('Padel Tunis cancelled this booking')
  const unpaid = cancellationEmail({ ...facts, recipientName: 'Sam', reason: null, refundAmount: 0, cancelledBy: 'you' })
  expect(unpaid.html).toContain('nothing to refund')

  const cash = reminderEmail({ ...facts, recipientName: 'Sam', state: 'pay_at_club', dueAtClub: 90, unpaidShares: 0, passUrl: null })
  expect(cash.subject).toContain('18:00')
  expect(cash.html).toContain('pay 90 TND in cash')
  expect(cash.html).toContain('ABCD1234') // a guest has no pass link, so the reference is quoted
  const shares = reminderEmail({ ...facts, recipientName: 'Sam', state: 'awaiting_shares', dueAtClub: 0, unpaidShares: 2, passUrl: 'https://shiftgrid.test/p' })
  expect(shares.html).toContain('2 shares are still unpaid')
  expect(shares.html).toContain('href="https://shiftgrid.test/p"')
})

/* ----------------------------- emails from real bookings ------------------------ */

async function openClub(page: Page, dayOffset: number) {
  await page.goto(`/courts/${clubId}?date=${daysFromNow(dayOffset)}`)
  await expect(page.getByRole('button', { name: /Available/ }).first()).toBeVisible()
}
async function pickPadel(page: Page) {
  await page.getByRole('button', { name: /Padel Court 1.*Available/ }).first().click()
  await expect(page.getByText('Reserve your slot')).toBeVisible()
}
const drawer = (page: Page) => page.getByRole('dialog')

async function bookingIdFromPass(page: Page): Promise<string> {
  await drawer(page).getByRole('link', { name: 'View your pass' }).click()
  await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]{36}\?token=/)
  return new URL(page.url()).pathname.split('/').pop()!
}

test('a guest booking with an email: confirmation recorded once, address remembered, nothing secret stored', async ({ page }) => {
  await openClub(page, 44)
  await pickPadel(page)
  await drawer(page).getByLabel(/Pay all now/).check()
  await drawer(page).getByRole('tab', { name: 'Guest' }).click()
  await drawer(page).locator('#guest-name').fill('E2E Mail Guest')
  await drawer(page).locator('#guest-phone').fill('98121212')

  await drawer(page).locator('#guest-consent').check()
  await drawer(page).locator('#guest-email').fill('E2E.Mail.Guest@Example.com')
  await drawer(page).getByRole('button', { name: /Pay 90 TND & Reserve/ }).click()
  await expect(drawer(page)).toContainText('Booking confirmed')
  const cancelLink = await drawer(page).getByLabel('Cancellation link').inputValue()
  const bookingId = await bookingIdFromPass(page)

  const rows = await waitForOutbox(bookingId, (r) => r.some((x) => x.kind === 'booking_confirmation' && x.status !== 'pending') && r)
  const confirmation = rows.find((r) => r.kind === 'booking_confirmation')!
  expect(confirmation.recipient).toBe('e2e.mail.guest@example.com') // normalised
  expect(DELIVERY_OK).toContain(confirmation.status)
  expect(confirmation.subject).toContain('Booking confirmed')
  expect(rows.filter((r) => r.kind === 'booking_confirmation')).toHaveLength(1)

  // The guest's address is stored for the reminder and the cancellation notice.
  const { data: booking } = await adminClient().from('bookings').select('booker_anon_id').eq('id', bookingId).single()
  const { data: guest } = await adminClient().from('anonymous_bookers').select('email').eq('id', booking!.booker_anon_id!).single()
  expect(guest!.email).toBe('e2e.mail.guest@example.com')

  // The pass link carries the guest's secret, so no stored column may contain it.
  expect(JSON.stringify(rows)).not.toMatch(TOKEN)

  // Cancelling through the private link sends a cancellation notice that mentions the refund.
  await page.goto(cancelLink)
  await page.getByRole('button', { name: 'Cancel this booking' }).click()
  await page.getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(page.getByText(/cancelled/i).first()).toBeVisible()

  const after = await waitForOutbox(bookingId, (r) => r.some((x) => x.kind === 'cancellation') && r)
  const cancellation = after.find((r) => r.kind === 'cancellation')!
  expect(cancellation.recipient).toBe('e2e.mail.guest@example.com')
  expect(DELIVERY_OK).toContain(cancellation.status)
  expect((cancellation.payload as { refundAmount: number; cancelledBy: string }).refundAmount).toBe(90)
  expect((cancellation.payload as { cancelledBy: string }).cancelledBy).toBe('you')
  expect(JSON.stringify(after)).not.toMatch(TOKEN)
})

test('a split booking emails each tagged player their link; a blank box sends nothing', async ({ page }) => {
  await openClub(page, 45)
  await pickPadel(page)
  await drawer(page).getByLabel(/Split ·/).check()
  await drawer(page).getByLabel('Email for player 2').fill('e2e.friend.one@example.com')
  await drawer(page).getByLabel('Email for player 4').fill('e2e.friend.three@example.com')
  await drawer(page).getByRole('tab', { name: 'Guest' }).click()
  await drawer(page).locator('#guest-name').fill('E2E Split Organizer')
  await drawer(page).locator('#guest-phone').fill('98343434')

  await drawer(page).locator('#guest-consent').check()
  await drawer(page).locator('#guest-email').fill('e2e.organizer@example.com')
  await drawer(page).getByRole('button', { name: /Pay 22\.50 TND & Reserve/ }).click()
  await expect(drawer(page)).toContainText('waiting for your players')
  const bookingId = await bookingIdFromPass(page)

  const rows = await waitForOutbox(
    bookingId,
    (r) => r.filter((x) => x.kind === 'split_invite').length === 2 && r.some((x) => x.kind === 'booking_confirmation') && r
  )
  const invites = rows.filter((r) => r.kind === 'split_invite')
  expect(invites.map((r) => r.recipient).sort()).toEqual(['e2e.friend.one@example.com', 'e2e.friend.three@example.com'])
  for (const row of invites) {
    expect(DELIVERY_OK).toContain(row.status)
    expect(row.subject).toContain('E2E Split Organizer invited you')
    expect(row.payload).toBeNull() // invite emails carry a secret link: nothing to re-render from
  }
  expect(rows.find((r) => r.kind === 'booking_confirmation')!.recipient).toBe('e2e.organizer@example.com')
  expect(JSON.stringify(rows)).not.toMatch(TOKEN)
})

test('a bad invite address is caught before booking, not silently dropped', async ({ page }) => {
  await openClub(page, 46)
  await pickPadel(page)
  await drawer(page).getByLabel(/Split ·/).check()
  await drawer(page).getByLabel('Email for player 2').fill('not-an-email')
  await drawer(page).getByRole('tab', { name: 'Guest' }).click()
  await drawer(page).locator('#guest-name').fill('E2E Typo Organizer')
  await drawer(page).locator('#guest-phone').fill('98454545')

  await drawer(page).locator('#guest-consent').check()
  await drawer(page).getByRole('button', { name: /Pay 22\.50 TND & Reserve/ }).click()
  await expect(drawer(page).getByRole('alert')).toContainText('does not look like an email address')
  await expect(drawer(page)).not.toContainText('waiting for your players')
})

/* ---------------------------------- reminders ------------------------------------ */

const cronUrl = '/api/cron/notifications'
const secret = () => loadEnv().CRON_SECRET!

/** A booking starting `minutes` from now, with a guest email, via the same RPC the app uses. */
async function bookingStartingIn(minutes: number, name: string, opts: { backdate: boolean }, sport: 'tennis' | 'padel' = 'tennis') {
  const admin = adminClient()
  const { data: court } = await admin.from('courts').select('id').eq('org_id', clubId).eq('sport', sport).limit(1).single()
  const start = new Date(Date.now() + minutes * 60_000)
  start.setUTCSeconds(0, 0)
  const { data, error } = await admin.rpc('create_booking', {
    p_org_id: clubId,
    p_court_id: court!.id,
    p_sport: sport,
    p_starts_at: start.toISOString(),
    p_player_count: sport === 'padel' ? 4 : 2,
    p_amount: sport === 'padel' ? 90 : 30,
    p_guest_name: name,
    // A guest is one row per (club, phone): give each test guest their own number.
    p_guest_phone: `+21698${String(Math.floor(Math.random() * 900000) + 100000)}`,
  })
  if (error) throw new Error(error.message)
  const id = (data as { booking_id: string }).booking_id
  const { data: b } = await admin.from('bookings').select('booker_anon_id').eq('id', id).single()
  await admin.from('anonymous_bookers').update({ email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` }).eq('id', b!.booker_anon_id!)
  if (opts.backdate) {
    await admin.from('bookings').update({ created_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('id', id)
  }
  return id
}

test('the cron endpoint is closed without the secret', async ({ request }) => {
  expect((await request.get(cronUrl)).status()).toBe(401)
  expect((await request.get(cronUrl, { headers: { authorization: 'Bearer wrong-secret-wrong-secret' } })).status()).toBe(401)
  expect((await request.get(cronUrl, { headers: { authorization: secret() } })).status()).toBe(401) // missing "Bearer"
})

test('reminders: due bookings are reminded once; last-minute and far-off ones are not', async ({ request }) => {
  const due = await bookingStartingIn(90, 'E2E Reminder Due', { backdate: true })
  const lastMinute = await bookingStartingIn(100, 'E2E Reminder Late', { backdate: false }, 'padel') // booked inside the 2 h window
  const farOff = await bookingStartingIn(5 * 60, 'E2E Reminder Far', { backdate: true })

  const headers = { authorization: `Bearer ${secret()}` }
  const first = await request.get(cronUrl, { headers })
  expect(first.status()).toBe(200)
  const body = await first.json()
  expect(body.ok).toBe(true)
  expect(body.reminders.considered).toBeGreaterThanOrEqual(1)

  const rows = await outboxFor(due)
  expect(rows.map((r) => r.kind)).toEqual(['reminder_2h'])
  expect(rows[0].recipient).toBe('e2e.reminder.due@example.com')
  expect(DELIVERY_OK).toContain(rows[0].status)
  expect(rows[0].subject).toContain('Reminder: you play at')
  expect(JSON.stringify(rows)).not.toMatch(TOKEN)

  expect(await outboxFor(lastMinute)).toHaveLength(0)
  expect(await outboxFor(farOff)).toHaveLength(0)

  // Running it again (a double trigger, an overlapping run) must not send twice.
  const second = await request.get(cronUrl, { headers })
  expect(second.status()).toBe(200)
  expect(await outboxFor(due)).toHaveLength(1)
})

test('a failed email is retried by the cron run and then recorded', async ({ request }) => {
  const id = await bookingStartingIn(40 * 60, 'E2E Retry Guest', { backdate: true })
  // A reminder row left "failed" by an earlier run (payload = what the template needs).
  const admin = adminClient()
  const props = { ...facts, recipientName: 'E2E Retry Guest', state: 'pay_at_club', dueAtClub: 30, unpaidShares: 0, passUrl: null }
  const { data: row } = await admin
    .from('notifications')
    .insert({
      kind: 'reminder_2h',
      booking_id: id,
      recipient: 'e2e.retry.guest@example.com',
      subject: 'Reminder: retry',
      status: 'failed',
      attempts: 1,
      last_error: 'provider timed out',
      payload: props,
      dedupe_key: `reminder_2h:${id}`,
    })
    .select('id')
    .single()

  const res = await request.get(cronUrl, { headers: { authorization: `Bearer ${secret()}` } })
  expect(res.status()).toBe(200)
  expect((await res.json()).retried.considered).toBeGreaterThanOrEqual(1)

  const { data: after } = await admin.from('notifications').select('status, attempts, last_error').eq('id', row!.id).single()
  expect(after!.attempts).toBe(2)
  expect(DELIVERY_OK).toContain(after!.status)
  expect(after!.last_error).not.toBe('provider timed out') // replaced by this attempt's outcome
})

/* ------------------------------ live staff alerts ---------------------------------- */

test('staff see a live alert when a slot is booked and when it is cancelled', async ({ page }) => {
  await page.goto('/login-owner')
  await page.locator('#email').fill('owner@shiftgrid.local')
  await page.locator('#password').fill(loadEnv().SEED_PASSWORD || 'ShiftGrid-Dev-1!')
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/dashboard/)
  await page.goto('/dashboard/org/bookings')
  const bell = page.getByTestId('alerts-bell')
  await expect(bell).toBeVisible()
  await expect(page.getByTestId('alerts-unread')).toHaveCount(0)
  // Give the realtime channel a moment to subscribe before provoking events.
  await page.waitForTimeout(3000)

  const id = await bookingStartingIn(48 * 60, 'E2E Alert Guest', { backdate: false })
  await expect(page.locator('[data-sonner-toast]', { hasText: 'New booking' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('alerts-unread')).toHaveText('1')

  await adminClient().from('bookings').update({ status: 'cancelled', cancellation_reason: 'e2e' }).eq('id', id)
  await expect(page.locator('[data-sonner-toast]', { hasText: 'Booking cancelled' })).toBeVisible({ timeout: 30_000 })

  // Opening the bell lists both, with who and what, and clears the badge.
  await bell.click()
  const items = page.getByTestId('alert-item')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('Booking cancelled')
  await expect(items.first()).toContainText('E2E Alert Guest')
  await expect(items.first()).toContainText('Tennis Court 1')
  await expect(items.nth(1)).toContainText('New booking')
  await expect(page.getByTestId('alerts-unread')).toHaveCount(0)
})

test('the bookings board refreshes by itself when a booking arrives, alongside the bell', async ({ page }) => {
  await page.goto('/login-owner')
  await page.locator('#email').fill('owner@shiftgrid.local')
  await page.locator('#password').fill(loadEnv().SEED_PASSWORD || 'ShiftGrid-Dev-1!')
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/dashboard/)

  // Open the board on the day the booking will fall on, then add the booking from outside.
  const startsInMinutes = 52 * 60
  const day = venueDateString(new Date(Date.now() + startsInMinutes * 60_000))
  await page.goto(`/dashboard/org/bookings?date=${day}`)
  await expect(page.getByTestId('alerts-bell')).toBeVisible()
  await page.waitForTimeout(3000) // let the shared realtime feed subscribe
  await expect(page.getByText('E2E Board Guest')).toHaveCount(0)

  await bookingStartingIn(startsInMinutes, 'E2E Board Guest', { backdate: false })
  // No reload: the board and the bell both hear about it through the one shared feed.
  await expect(page.getByText('E2E Board Guest').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-sonner-toast]', { hasText: 'New booking' })).toBeVisible({ timeout: 30_000 })
})

test('with the realtime socket blocked, the bell and the board still catch up by polling', async ({ page }) => {
  // Every Realtime WebSocket is closed the moment it opens (a proxy that blocks them).
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => void ws.close())

  await page.goto('/login-owner')
  await page.locator('#email').fill('owner@shiftgrid.local')
  await page.locator('#password').fill(loadEnv().SEED_PASSWORD || 'ShiftGrid-Dev-1!')
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/dashboard/)

  const startsInMinutes = 54 * 60
  const day = venueDateString(new Date(Date.now() + startsInMinutes * 60_000))
  await page.goto(`/dashboard/org/bookings?date=${day}`)
  await expect(page.getByTestId('alerts-bell')).toBeVisible()
  await page.waitForTimeout(3000) // the socket has been refused by now
  await page.getByTestId('alerts-bell').click()
  await expect(page.getByText(/Reconnecting/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('E2E Poll Guest')).toHaveCount(0)

  await bookingStartingIn(startsInMinutes, 'E2E Poll Guest', { backdate: false })
  // No event can arrive; the fast fallback poll (~10 s) finds it.
  await expect(page.locator('[data-sonner-toast]', { hasText: 'New booking' })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByText('E2E Poll Guest').first()).toBeVisible({ timeout: 40_000 })
})
