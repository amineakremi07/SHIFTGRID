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
// The club may have repriced its courts: read the padel price from the database instead of baking it in.
let PADEL: number
let SHARE: string
const tnd = (n: number) => {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}
test.beforeAll(async () => {
  clubId = await getTestClubId()
  const { data: padel } = await adminClient().from('courts').select('price_per_hour').eq('org_id', clubId).eq('name', 'Padel Court 1').is('deleted_at', null).single()
  PADEL = Math.round(Number(padel!.price_per_hour) * 1.5 * 100) / 100
  SHARE = tnd(PADEL / 4)
})

/** Open the club on a far-future day, one day per test so slots never collide. */
async function openClub(page: Page, dayOffset: number) {
  await page.goto(`/courts/${clubId}?date=${daysFromNow(dayOffset)}`)
  await expect(page.getByRole('button', { name: /Disponible/ }).first()).toBeVisible()
}

/** The first available slot of a court (optionally only peak ones), clicked. */
async function pickSlot(page: Page, court: string, opts: { peak?: boolean } = {}) {
  const slots = page.getByRole('button', { name: new RegExp(`${court}.*Disponible.*${opts.peak ? ', tarif de pointe' : ''}`) })
  await slots.first().click()
  await expect(page.getByText('Réservez votre créneau')).toBeVisible()
}

const drawer = (page: Page) => page.getByRole('dialog')
/** Step 1 -> 2 (payment) and 2 -> 3 (confirm): the drawer's "Continue" button. */
const nextStep = (page: Page) => drawer(page).getByTestId('step-next').click()
const priceSummary = (page: Page) => drawer(page).getByLabel('Récapitulatif du prix')

async function fillGuest(page: Page, name: string, phone: string) {
  await nextStep(page) // payment -> confirm
  await drawer(page).getByRole('tab', { name: 'Invité' }).click()
  await drawer(page).locator('#guest-name').fill(name)
  await drawer(page).locator('#guest-phone').fill(phone)

  await drawer(page).locator('#guest-consent').check()
}

test('slot picker: legend, peak tags, and the duration and price change with the sport', async ({ page }) => {
  await openClub(page, 40)

  // Legend explains the colours and the peak tag.
  const legend = page.getByRole('list', { name: 'Légende' })
  await expect(legend).toContainText('Disponible')
  await expect(legend).toContainText('Sélectionné')
  await expect(legend).toContainText('Réservé ou indisponible')
  await expect(legend).toContainText('Pointe')

  // Padel: 90 minutes, off-peak morning slot = base price, no surcharge line.
  await pickSlot(page, 'Padel Court 1')
  await expect(drawer(page)).toContainText('90 min')
  await expect(priceSummary(page)).toContainText(`${tnd(PADEL)} TND`)
  await expect(priceSummary(page)).not.toContainText("Supplément d'éclairage de nuit")
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()

  // Padel, peak evening slot: carries the lighting surcharge, so it costs more.
  await page.getByRole('tab', { name: 'Padel' }).click()
  await pickSlot(page, 'Padel Court 1', { peak: true })
  await expect(priceSummary(page)).toContainText("Supplément d'éclairage de nuit")
  const peakTotal = await priceSummary(page).getByText(/^\d+(\.\d+)? TND$/).last().innerText()
  expect(parseFloat(peakTotal)).toBeGreaterThan(PADEL)
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()

  // Tennis: 60 minutes and a different (lower) price.
  await page.getByRole('tab', { name: 'Tennis' }).click()
  await pickSlot(page, 'Tennis Court 1')
  await expect(drawer(page)).toContainText('60 min')
  // The price comes from the court row (a club may have its own "Tennis Court 1"), not a number baked into the test.
  const { data: tennis } = await adminClient().from('courts').select('price_per_hour').eq('org_id', clubId).eq('name', 'Tennis Court 1').is('deleted_at', null).single()
  await expect(priceSummary(page)).toContainText(`${Number(tennis!.price_per_hour)} TND`)
  await expect(priceSummary(page)).not.toContainText(`${tnd(PADEL)} TND`)
})

test('payment choices: three methods, split preview shows the share', async ({ page }) => {
  await openClub(page, 41)
  await pickSlot(page, 'Padel Court 1')
  await nextStep(page)

  await expect(drawer(page).getByRole('radio')).toHaveCount(3)
  await expect(drawer(page).getByRole('radio', { name: /Tout payer maintenant/ })).toBeEnabled()
  await expect(drawer(page).getByRole('radio', { name: /Partager ·/ })).toBeEnabled()
  await expect(drawer(page).getByRole('radio', { name: /Au club/ })).toBeChecked()

  await drawer(page).getByRole('radio', { name: /Partager ·/ }).check()
  // The share is on the option itself (the longer sentence lives behind its info icon).
  await expect(drawer(page)).toContainText(`Partager · ${SHARE} TND chacun`)
  await expect(drawer(page)).toContainText('TEST')

  // The chosen method carries to the last step, and the progress map goes back without losing it.
  await nextStep(page)
  await expect(drawer(page).getByRole('button', { name: new RegExp(`Payer ${SHARE} TND et réserver`) })).toBeVisible()
  await drawer(page).getByTestId('step-2').click()
  await expect(drawer(page).getByRole('radio', { name: /Partager ·/ })).toBeChecked()
  await drawer(page).getByRole('radio', { name: /Tout payer maintenant/ }).check()
  await nextStep(page)
  await expect(drawer(page).getByRole('button', { name: new RegExp(`Payer ${tnd(PADEL)} TND et réserver`) })).toBeVisible()
})

test('full booking: pay online, land on the pass at /reservations/[id]', async ({ page }) => {
  await openClub(page, 42)
  await pickSlot(page, 'Padel Court 1')
  await nextStep(page)
  await drawer(page).getByRole('radio', { name: /Tout payer maintenant/ }).check()
  await fillGuest(page, 'E2E Full Booking', '98111222')
  await drawer(page).getByRole('button', { name: new RegExp(`Payer ${tnd(PADEL)} TND et réserver`) }).click()

  await expect(drawer(page)).toContainText('Réservation confirmée')
  await drawer(page).getByRole('link', { name: 'Voir votre pass' }).click()

  // A guest's pass link carries the booking's secret.
  await expect(page).toHaveURL(new RegExp(`/reservations/${UUID}\\?token=${TOKEN}$`))
  await expect(page.getByTestId('reference')).toHaveText(/^[0-9A-F]{8}$/)
  await expect(page.getByTestId('payment-summary')).toContainText('Payée en totalité')
  await expect(page.getByText('Confirmée', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /^QR code d'enregistrement pour la réservation/ }).locator('svg')).toHaveCount(1)

  // The pass is private: without the secret link or a session it does not exist.
  // (The route has a loading.tsx, so Next streams its "not found" with HTTP 200; what
  // matters is that no pass content is ever sent.)
  const bare = page.url().split('?')[0]
  const stranger = await page.context().browser()!.newContext()
  const strangerPage = await stranger.newPage()
  for (const url of [bare, `${bare}?token=${'a'.repeat(48)}`]) {
    await strangerPage.goto(url)
    await expect(strangerPage.getByText('Cette page est introuvable')).toBeVisible()
    await expect(strangerPage.getByTestId('reference')).toHaveCount(0)
    await expect(strangerPage.getByText('Pass de réservation')).toHaveCount(0)
  }
  await stranger.close()
})

test('split payment: invite links are generated, distinct, and each can be paid once', async ({ page, browser }) => {
  await openClub(page, 43)
  await pickSlot(page, 'Padel Court 1')
  await nextStep(page)
  await drawer(page).getByRole('radio', { name: /Partager ·/ }).check()
  await fillGuest(page, 'E2E Split Booking', '98333444')
  await drawer(page).getByRole('button', { name: new RegExp(`Payer ${SHARE} TND et réserver`) }).click()

  await expect(drawer(page)).toContainText('en attente de vos joueurs')
  await expect(drawer(page)).toContainText('Payé maintenant')
  await expect(drawer(page)).toContainText(`${SHARE} TND`)

  // Three other players, three different one-use links.
  const inputs = drawer(page).getByLabel(/^Lien de paiement du joueur/)
  await expect(inputs).toHaveCount(3)
  const links = await inputs.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(new Set(links).size).toBe(3)
  for (const link of links) expect(link).toMatch(new RegExp(`/reservations/join\\?token=${TOKEN}$`))

  await drawer(page).getByRole('link', { name: 'Voir votre pass' }).click()
  await expect(page.getByTestId('payment-summary')).toContainText('1 part sur 4 payée')

  // A friend opens a link and pays; the link then reads as already paid.
  const friend = await browser.newContext()
  const friendPage = await friend.newPage()
  await friendPage.goto(links[0])
  await expect(friendPage.getByText('Votre part', { exact: true })).toBeVisible()
  await expect(friendPage.getByText(`${SHARE} TND`).first()).toBeVisible()
  await friendPage.locator('#payer-name').fill('E2E Friend')
  await friendPage.getByRole('button', { name: /^Payer / }).click()
  await expect(friendPage.getByText('Votre part est payée')).toBeVisible()
  await friendPage.goto(links[0])
  await expect(friendPage.getByText(/déjà payée/)).toBeVisible()
  await friend.close()

  // The organizer's pass now shows two of four, and the booking is still awaiting the rest.
  await page.reload()
  await expect(page.getByTestId('payment-summary')).toContainText('2 parts sur 4 payées')
  await expect(page.getByText('Paiements en attente')).toBeVisible()

  // A made-up link is rejected with the same page as an unknown one.
  const bogus = await browser.newContext()
  const bogusPage = await bogus.newPage()
  await bogusPage.goto(`/reservations/join?token=${'a'.repeat(48)}`)
  await expect(bogusPage.getByText("Ce lien de paiement n'est pas valide")).toBeVisible()
  await bogus.close()
})
