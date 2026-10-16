import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { horizontalOverflow } from '../support/collections.js';
import { OPS_UK, signInAsOperator } from '../support/operator.js';
import { guestApi, seedReport } from '../support/reports.js';

// The operator console at /ops (slice 9, R4, [P8]): the operator's service account only; for
// anyone else signed in it does not exist, and a signed-out visitor signs in first.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

test.describe('ops console access', () => {
  test('a signed-in admin gets the 404 page, with nothing of the console', async ({ page }) => {
    await signIn(page, newEmail());
    // The same generic page as any unknown address: nothing says the console exists.
    for (const path of ['/ops', `/ops/reports/${randomUUID()}`, '/no-such-page']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole('banner', { name: OPS_UK.title })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'На головну' })).toHaveAttribute('href', '/app');
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

    // The statuses are the console's tab row: links, the current one `aria-current="page"`.
    const statuses = page.getByRole('navigation', { name: 'Стан скарг' });
    await statuses.getByRole('link', { name: 'Відхилені' }).click();
    await expect(page).toHaveURL(/status=dismissed/);
    await expect(statuses.getByRole('link', { name: 'Відхилені' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('Відхилених скарг ще немає')).toBeVisible();
  });

  test('the queue fits a 360px phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signInAsOperator(page, testInfo);
    await expect(page.getByRole('heading', { name: 'Скарги', level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('the detail: hide the frame with a reason; guests no longer get it', async ({
    browser,
    page,
  }, testInfo) => {
    const admin = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signIn(admin, newEmail());
    const seeded = await seedReport(admin);
    const baseURL = new URL(admin.url()).origin;
    await admin.context().close();

    await signInAsOperator(page, testInfo);
    await page.goto(`/ops/reports/${seeded.reportId}`);
    await expect(
      page.getByRole('heading', { name: 'Порушує приватність', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Привітання від гостя')).toBeVisible();
    await expect(page.getByText('Видимий', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Приховати кадр' }).click();
    const dialog = page.getByRole('dialog', { name: 'Приховати кадр' });
    await dialog.getByRole('button', { name: 'Приховати', exact: true }).click();
    // An empty reason keeps the dialog open with the field's error.
    await expect(dialog.getByText('Вкажіть причину')).toBeVisible();
    await dialog.getByLabel('Причина').fill('Тест');
    await dialog.getByRole('button', { name: 'Приховати', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Прихований', { exact: true })).toBeVisible();
    await expect(page.getByText('Приховано модерацією. Причина: Тест')).toBeVisible();

    const guest = await guestApi(baseURL, seeded.collectionId, seeded.linkPath);
    const res = await guest.get(
      `/api/v1/guest/collections/${seeded.collectionId}/content/${seeded.contentId}`,
    );
    expect(res.status()).toBe(404);
    await guest.dispose();
  });

  test('a report that does not exist', async ({ page }, testInfo) => {
    await signInAsOperator(page, testInfo);
    await page.goto(`/ops/reports/${randomUUID()}`);
    await expect(page.getByRole('heading', { name: 'Скаргу не знайдено' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Усі скарги' })).toBeVisible();
  });
});
