import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { horizontalOverflow } from '../support/collections.js';
import { OPS_UK, signInAsOperator } from '../support/operator.js';
import { seedReport } from '../support/reports.js';

// The operator console at /ops (slice 9, R4, [P8]): the operator's service account only; for
// anyone else signed in it does not exist, and a signed-out visitor signs in first.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

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

  test('the queue: a new report first, with its reason, frame and collection', async ({
    browser,
    page,
  }, testInfo) => {
    const admin = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signIn(admin, newEmail());
    const seeded = await seedReport(admin, { reason: 'PRIVACY' });
    await admin.context().close();

    await signInAsOperator(page, testInfo);
    await expect(page.getByRole('heading', { name: 'Скарги', level: 1 })).toBeVisible();
    // Other tests' reports may be newer (the API tests prove the order); find this one by its
    // link. On phones the rows are cards, from `md` a table.
    const link = page
      .locator(`a[href="/ops/reports/${seeded.reportId}"]`)
      .filter({ visible: true });
    await expect(link).toContainText(`#${String(seeded.frameNo).padStart(3, '0')}`);
    const row = page.locator('tr, li').filter({ has: link });
    await expect(row).toContainText('Порушує приватність');
    await expect(row).toContainText(seeded.title);

    await page.getByRole('tab', { name: 'Відхилені' }).click();
    await expect(page).toHaveURL(/status=dismissed/);
    await expect(page.getByText('Відхилених скарг ще немає')).toBeVisible();
  });

  test('the queue fits a 360px phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signInAsOperator(page, testInfo);
    await expect(page.getByRole('heading', { name: 'Скарги', level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
