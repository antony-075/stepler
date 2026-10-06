import { expect, type Page, test } from '@playwright/test';
import { newEmail, requestLink, signIn } from '../support/auth.js';
import { openGuestLink } from '../support/guest.js';
import { signInAsOperator } from '../support/operator.js';
import { seedReport } from '../support/reports.js';

// Slice 9, R7: the operator blocks a reported collection, then its owner's account. Guests,
// the admin's page, the dashboard and sign-in each say so. Phones and desktop.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

/** Runs one of the console's reasoned actions on the report's page. */
async function act(ops: Page, reportId: string, button: string, confirm: string, reason: string) {
  await ops.goto(`/ops/reports/${reportId}`);
  await ops.getByRole('button', { name: button }).click();
  const dialog = ops.getByRole('dialog', { name: button });
  await dialog.getByLabel('Причина').fill(reason);
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('blocking', () => {
  test('a blocked collection, then a blocked account', async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000);
    const owner = newEmail();
    await signIn(page, owner);
    const seeded = await seedReport(page, { title: 'Випускний 11-Б' });

    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    await act(ops, seeded.reportId, 'Заблокувати колекцію', 'Заблокувати', 'Спам у колекції');

    // Guests: the collection is unavailable.
    const guest = await openGuestLink(browser, seeded.linkPath);
    await expect(guest.getByRole('heading', { name: 'Колекція недоступна' })).toBeVisible();

    // The admin: the banner with the reason and where to write; the dashboard badge.
    await page.goto(`/app/collections/${seeded.collectionId}`);
    const banner = page.getByRole('status').filter({ hasText: 'Колекцію заблоковано модерацією' });
    await expect(banner).toContainText('Причина: Спам у колекції.');
    await expect(banner.getByRole('link', { name: 'privacy@stepler.test' })).toHaveAttribute(
      'href',
      'mailto:privacy@stepler.test',
    );
    // One truthful status (S1): «Заблоковано» in the status slot, «Доступ закрито» beside it,
    // and no «Колекція активна» anywhere on the row or card.
    await page.goto('/app');
    const blockedCard = page
      .locator('[data-slot="collection-card"]')
      .filter({ hasText: 'Випускний 11-Б' });
    await expect(blockedCard).toHaveAttribute('data-display-status', 'BLOCKED');
    await expect(blockedCard.locator('[data-slot="collection-status"]')).toHaveText('Заблоковано');
    await expect(blockedCard.locator('[data-slot="collection-access"]')).toHaveText(
      'Доступ закрито',
    );
    await expect(blockedCard.getByText('Колекція активна')).toHaveCount(0);
    // The ops detail shows the same one badge.
    await expect(ops.locator('[data-slot="collection-status"]')).toHaveText('Заблоковано');
    await expect(ops.getByText('Активна', { exact: true })).toHaveCount(0);

    // Unblocked: guests get in again.
    await act(ops, seeded.reportId, 'Розблокувати колекцію', 'Розблокувати', 'Виправлено');
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Колекція недоступна' })).toHaveCount(0);
    await expect(guest.getByRole('heading', { name: seeded.title })).toBeVisible();

    // A sign-in link the owner asked for before the account is blocked.
    const login = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    const pending = await requestLink(login, owner);

    await act(ops, seeded.reportId, 'Заблокувати акаунт', 'Заблокувати', 'Систематичні порушення');

    // The owner's open tab: the next navigation goes to sign-in.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
    // The link from before the block: the blocked message with the contact.
    await login.goto(pending);
    const blockedMessage = login.getByText(
      'Цей акаунт заблоковано. Якщо ви не згодні, напишіть на privacy@stepler.test.',
    );
    const signInButton = login.getByRole('button', { name: 'Увійти' });
    await expect(blockedMessage.or(signInButton)).toBeVisible();
    if (await signInButton.isVisible()) await signInButton.click();
    await expect(blockedMessage).toBeVisible();
    // Guests: unavailable again.
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Колекція недоступна' })).toBeVisible();

    for (const p of [ops, guest, login]) await p.context().close();
  });
});
