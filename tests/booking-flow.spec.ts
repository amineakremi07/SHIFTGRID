import { expect, test, type Page } from '@playwright/test'

import { adminClient, daysFromNow, getTestClubId } from './helpers/db'

/**
 * Milestone 9 end to end: the slot picker, a full booking through to its pass,
 * and split-payment links. Real browser, real database (see playwright.config.ts).
 *
 * Duration note: slot length is fixed per sport (tennis 60 min, padel 90 min),
 * there is no control to change it on one court. "60 to 90 minutes" is therefore
 * tested the way a player meets it: picking a tennis slot, then a padel slot.
 */

test.describe.configure({ mode: 'serial' })

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const TOKEN = '[0-9a-f]{48}'

let clubId: string
test.beforeAll(async () => {
  clubId = await getTestClubId()
})

/** Open the club on a far-future day, one day per test so slots never collide. */
async function openClub(page: Page, dayOffset: number) {
  await page.goto(`/courts/${clubId}?date=${daysFromNow(dayOffset)}`)
  await expect(page.getByRole('button', { name: /Available/ }).first()).toBeVisible()
}

/** The first available slot of a court (optionally only peak ones), clicked. */
async function pickSlot(page: Page, court: string, opts: { peak?: boolean } = {}) {
  const slots = page.getByRole('button', { name: new RegExp(`${court}.*Available.*${opts.peak ? ', peak price' : ''}`) })
  await slots.first().click()
  await expect(page.getByText('Reserve your slot')).toBeVisible()
}

const drawer = (page: Page) => page.getByRole('dialog')
const priceSummary = (page: Page) => drawer(page).getByLabel('Price summary')

async function fillGuest(page: Page, name: string, phone: string) {
  await drawer(page).getByRole('tab', { name: 'Guest' }).click()
  await drawer(page).locator('#guest-name').fill(name)
  await drawer(page).locator('#guest-phone').fill(phone)

  await drawer(page).locator('#guest-consent').check()
}

test('slot picker: legend, peak tags, and the duration and price change with the sport', async ({ page }) => {
  await openClub(page, 40)

  // Legend explains the colours and the peak tag.
  const legend = page.getByRole('list', { name: 'Legend' })
  await expect(legend).toContainText('Available')
  await expect(legend).toContainText('Selected')
  await expect(legend).toContainText('Booked or unavailable')
  await expect(legend).toContainText('Peak')

  // Padel: 90 minutes, off-peak morning slot = base price, no surcharge line.
  await pickSlot(page, 'Padel Court 1')
  await expect(drawer(page)).toContainText('90 min')
  await expect(priceSummary(page)).toContainText('90 TND')
  await expect(priceSummary(page)).not.toContainText('Night lighting surcharge')
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()

  // Padel, peak evening slot: carries the lighting surcharge, so it costs more.
  await page.getByRole('tab', { name: 'Padel' }).click()
  await pickSlot(page, 'Padel Court 1', { peak: true })
  await expect(priceSummary(page)).toContainText('Night lighting surcharge')
  const peakTotal = await priceSummary(page).getByText(/^\d+(\.\d+)? TND$/).last().innerText()
  expect(parseFloat(peakTotal)).toBeGreaterThan(90)
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()

  // Tennis: 60 minutes and a different (lower) price.
  await page.getByRole('tab', { name: 'Tennis' }).click()
  await pickSlot(page, 'Tennis Court 1')
  await expect(drawer(page)).toContainText('60 min')
  // The price comes from the court row (a club may have its own "Tennis Court 1"), not a number baked into the test.
  const { data: tennis } = await adminClient().from('courts').select('price_per_hour').eq('org_id', clubId).eq('name', 'Tennis Court 1').is('deleted_at', null).single()
  await expect(priceSummary(page)).toContainText(`${Number(tennis!.price_per_hour)} TND`)
  await expect(priceSummary(page)).not.toContainText('90 TND')
})

test('payment choices: three methods, split preview shows the share', async ({ page }) => {
  await openClub(page, 41)
  await pickSlot(page, 'Padel Court 1')

  await expect(drawer(page).getByRole('radio')).toHaveCount(3)
  await expect(drawer(page).getByLabel(/Pay in full online/)).toBeEnabled()
  await expect(drawer(page).getByLabel(/Split with your players/)).toBeEnabled()
  await expect(drawer(page).getByLabel(/Pay at the venue/)).toBeChecked()

  await drawer(page).getByLabel(/Split with your players/).check()
  await expect(drawer(page)).toContainText('Pay your 22.50 TND share')
  await expect(drawer(page).getByRole('button', { name: /Pay 22.50 TND & Reserve/ })).toBeVisible()

  await drawer(page).getByLabel(/Pay in full online/).check()
  await expect(drawer(page).getByRole('button', { name: /Pay 90 TND & Reserve/ })).toBeVisible()
  await expect(drawer(page)).toContainText('Test mode')
})

test('full booking: pay online, land on the pass at /reservations/[id]', async ({ page }) => {
  await openClub(page, 42)
  await pickSlot(page, 'Padel Court 1')
  await drawer(page).getByLabel(/Pay in full online/).check()
  await fillGuest(page, 'E2E Full Booking', '98111222')
  await drawer(page).getByRole('button', { name: /Pay 90 TND & Reserve/ }).click()

  await expect(drawer(page)).toContainText('Booking confirmed')
  await drawer(page).getByRole('link', { name: 'View your pass' }).click()

  // A guest's pass link carries the booking's secret.
  await expect(page).toHaveURL(new RegExp(`/reservations/${UUID}\\?token=${TOKEN}$`))
  await expect(page.getByTestId('reference')).toHaveText(/^[0-9A-F]{8}$/)
  await expect(page.getByTestId('payment-summary')).toContainText('Paid in full')
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Check-in QR code for booking/ }).locator('svg')).toHaveCount(1)

  // The pass is private: without the secret link or a session it does not exist.
  // (The route has a loading.tsx, so Next streams its "not found" with HTTP 200; what
  // matters is that no pass content is ever sent.)
  const bare = page.url().split('?')[0]
  const stranger = await page.context().browser()!.newContext()
  const strangerPage = await stranger.newPage()
  for (const url of [bare, `${bare}?token=${'a'.repeat(48)}`]) {
    await strangerPage.goto(url)
    await expect(strangerPage.getByText('This page could not be found')).toBeVisible()
    await expect(strangerPage.getByTestId('reference')).toHaveCount(0)
    await expect(strangerPage.getByText('Booking pass')).toHaveCount(0)
  }
  await stranger.close()
})

test('split payment: invite links are generated, distinct, and each can be paid once', async ({ page, browser }) => {
  await openClub(page, 43)
  await pickSlot(page, 'Padel Court 1')
  await drawer(page).getByLabel(/Split with your players/).check()
  await fillGuest(page, 'E2E Split Booking', '98333444')
  await drawer(page).getByRole('button', { name: /Pay 22.50 TND & Reserve/ }).click()

  await expect(drawer(page)).toContainText('waiting for your players')
  await expect(drawer(page)).toContainText('Paid now')
  await expect(drawer(page)).toContainText('22.50 TND')

  // Three other players, three different one-use links.
  const inputs = drawer(page).getByLabel(/^Payment link for player/)
  await expect(inputs).toHaveCount(3)
  const links = await inputs.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(new Set(links).size).toBe(3)
  for (const link of links) expect(link).toMatch(new RegExp(`/reservations/join\\?token=${TOKEN}$`))

  await drawer(page).getByRole('link', { name: 'View your pass' }).click()
  await expect(page.getByTestId('payment-summary')).toContainText('1 of 4 shares paid')

  // A friend opens a link and pays; the link then reads as already paid.
  const friend = await browser.newContext()
  const friendPage = await friend.newPage()
  await friendPage.goto(links[0])
  await expect(friendPage.getByText('Your share')).toBeVisible()
  await expect(friendPage.getByText('22.50 TND').first()).toBeVisible()
  await friendPage.locator('#payer-name').fill('E2E Friend')
  await friendPage.getByRole('button', { name: /^Pay / }).click()
  await expect(friendPage.getByText('Your share is paid')).toBeVisible()
  await friendPage.goto(links[0])
  await expect(friendPage.getByText(/already paid/)).toBeVisible()
  await friend.close()

  // The organizer's pass now shows two of four, and the booking is still awaiting the rest.
  await page.reload()
  await expect(page.getByTestId('payment-summary')).toContainText('2 of 4 shares paid')
  await expect(page.getByText('Awaiting payments')).toBeVisible()

  // A made-up link is rejected with the same page as an unknown one.
  const bogus = await browser.newContext()
  const bogusPage = await bogus.newPage()
  await bogusPage.goto(`/reservations/join?token=${'a'.repeat(48)}`)
  await expect(bogusPage.getByText('This payment link is not valid')).toBeVisible()
  await bogus.close()
})
