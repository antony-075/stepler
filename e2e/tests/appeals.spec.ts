import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { signInAsOperator } from '../support/operator.js';
import { seedReport } from '../support/reports.js';

// Slice 9b: the operator's deletion is a quarantine the admin sees greyed, with the reason and
// the purge date, and appeals in place; the operator decides in the console's appeal queue.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

/** One of the operator's content actions, through the API the console calls. */
async function operatorAction(ops: Page, contentId: string, action: string, reason: string) {
  const origin = new URL(ops.url()).origin;
  const res = await ops.request.post(`/api/v1/operator/content/${contentId}/${action}`, {
    data: { reason },
    headers: { origin },
  });
  expect(res.status()).toBe(204);
}

test.describe('appeals', () => {
  test('a quarantined frame: greyed for its admin, appealed in place', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page, newEmail());
    const seeded = await seedReport(page);
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    await operatorAction(ops, seeded.contentId, 'quarantine', 'Незаконний вміст');

    await page.goto(`/app/collections/${seeded.collectionId}`);
    const tile = page.getByRole('button', { name: /^Кадр 1, .*видалено модерацією/ });
    await expect(tile).toBeVisible();
    await expect(
      page.locator(`[data-frame="${seeded.frameNo}"] [data-slot="frame-face"]`),
    ).toHaveAttribute('data-dimmed', 'true');
    await expect(
      page.locator(`[data-frame="${seeded.frameNo}"] [data-slot="frame-ring"]`),
    ).toHaveAttribute('data-ring', 'destructive');
    const stateMenu = page.getByRole('button', { name: /^Стан:/ });
    await stateMenu.click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /^Видалено модерацією/ }),
    ).toContainText('1');
    await page.keyboard.press('Escape');

    await tile.click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Причина: Незаконний вміст');
    await expect(viewer).toContainText('буде видалено назавжди');
    await expect(viewer.getByRole('link', { name: 'Завантажити' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Приховати від гостей' })).toHaveCount(0);

    // The appeal: empty text keeps the dialog open; sent, the panel says it is under review.
    await viewer.getByRole('button', { name: 'Подати апеляцію' }).click();
    const form = page.getByRole('dialog', { name: 'Апеляція щодо кадру' });
    await form.getByRole('button', { name: 'Надіслати' }).click();
    await expect(form.getByRole('alert')).toHaveText('Напишіть пояснення');
    await form.getByLabel('Ваше пояснення').fill('Це наш власний текст, нічого незаконного.');
    await form.getByRole('button', { name: 'Надіслати' }).click();
    // Sent, the dialog is named by its confirmation.
    const sent = page.getByRole('dialog', { name: 'Апеляцію надіслано' });
    await expect(sent.getByRole('heading', { name: 'Апеляцію надіслано' })).toBeFocused();
    await sent.getByRole('button', { name: 'Закрити' }).click();
    await expect(sent).toBeHidden();
    await expect(viewer).toContainText('Розглядається');
    await expect(viewer.getByRole('button', { name: 'Подати апеляцію' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await ops.context().close();
  });
});
