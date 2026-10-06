import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { OPS_UK, signInAsOperator } from '../support/operator.js';

// The operator console at /ops (slice 9, R4, [P8]): the operator's service account only; for
// anyone else signed in it does not exist, and a signed-out visitor signs in first.

test.describe('ops console access', () => {
  test('a signed-in admin gets the 404 page, with nothing of the console', async ({ page }) => {
    await signIn(page, newEmail());
    for (const path of ['/ops', `/ops/reports/${randomUUID()}`]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole('banner', { name: OPS_UK.title })).toHaveCount(0);
    }
  });

  test('a signed-out visitor is sent to sign in', async ({ page }) => {
    await page.goto('/ops');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the operator gets the console: its own header, no collections', async ({
    page,
  }, testInfo) => {
    const email = await signInAsOperator(page, testInfo);
    const header = page.getByRole('banner', { name: OPS_UK.title });
    await expect(header).toBeVisible();
    await expect(header).toContainText(email);
    await expect(page.getByRole('link', { name: 'Колекції' })).toHaveCount(0);
  });
});
