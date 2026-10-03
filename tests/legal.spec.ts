import { expect, test } from '@playwright/test'

test.describe('legal pages', () => {
  test('/privacy is public, names the Tunisian law and the data-subject rights', async ({ page }) => {
    const res = await page.goto('/privacy')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByText('2004-63').first()).toBeVisible()
    await expect(page.getByText('INPDP').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /Your rights/ })).toBeVisible()
    await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible()
  })

  test('/terms is public and states the booking, cancellation and split rules', async ({ page }) => {
    const res = await page.goto('/terms')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible()
    for (const h of [/Booking a court/, /Pay at the venue/, /Split payments/, /Cancellation and refunds/]) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible()
    }
    await expect(page.getByText('24 hours before it starts')).toBeVisible()
    await expect(page.getByText('TND').first()).toBeVisible()
  })

  test('the home footer links to both', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  test('the player registration form will not submit without the consent box', async ({ page }) => {
    await page.goto('/register?role=player')
    const box = page.locator('#player-terms')
    await expect(box).toBeVisible()
    await expect(box).not.toBeChecked()
    await page.locator('#player-name').fill('Consent Check')
    await page.locator('#player-email').fill('consent.check@example.com')
    await page.locator('#player-phone').fill('98121299')
    await page.locator('#player-password').fill('longenough1')
    await page.getByRole('button', { name: 'Create player account' }).click()
    await expect(page.getByText(/must accept the Terms of Service/)).toBeVisible()
    await expect(page).toHaveURL(/\/register/)
  })
})
