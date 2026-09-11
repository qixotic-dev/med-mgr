import { test, expect } from '@playwright/test'

// Real Google Sign-In can't be driven headlessly in CI, so this suite only
// covers what's testable without it: an unauthenticated visitor is gated
// out of the app entirely. Run against the Firebase emulators (see
// playwright.config.mts) so this never touches the real project.
test.describe('auth gate', () => {
  test('redirects an unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('shows a Google sign-in button when signed out', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeVisible()
  })
})
