import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { endTrial } from '../support/database.js';
import { mainLinkPath, openGuestLink } from '../support/guest.js';
import { signInAsOperator } from '../support/operator.js';

// Billing M1 (ADR 0018): the trial's end makes everything view-only for the admin and closed for
// guests, and the operator's complimentary plan lifts it.

// Ukrainian copy: an unsupported browser language falls back to it.
test.use({ locale: 'de-DE' });

const UK = {
  banner: 'Пробний період завершився — колекції доступні лише для перегляду',
  newCollection: 'Нова колекція',
  readOnlyShort: 'Лише перегляд',
  guestClosed: 'Колекція доступна лише для перегляду',
  addFiles: 'Додати фото й відео',
};

test('the trial ends: view-only for the admin, closed for guests; a free plan lifts it', async ({
  page,
  browser,
}, testInfo) => {
  const email = newEmail();
  await signIn(page, email);
  // A new account is on its trial: the dashboard says how long, and nothing warns yet.
  await expect(page.getByRole('link', { name: /Пробний період: ще/ })).toBeVisible();
  await expect(page.getByText(UK.banner)).toHaveCount(0);
  const { id } = await createCollectionViaApi(page, 'Весілля Олени');
  const guestPath = await mainLinkPath(page, id);

  endTrial(email);
  await page.reload();
  await expect(page.getByText(UK.banner)).toBeVisible();
  await expect(page.getByRole('link', { name: UK.readOnlyShort })).toBeVisible();
  const create = page.getByRole('button', { name: UK.newCollection });
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription(/Гості не можуть нічого додавати/);
  expect(await horizontalOverflow(page)).toBe(0);

  // «Тариф і оплата» says the same, honestly: no pay button yet.
  await page.getByRole('link', { name: 'Обрати тариф' }).click();
  await expect(page).toHaveURL(/\/app\/billing$/);
  await expect(page.getByRole('heading', { name: 'Тариф і оплата', level: 1 })).toBeVisible();
  await expect(page.getByText('Лише перегляд', { exact: true })).toBeVisible();
  await expect(page.getByText(/Оплата карткою з’явиться/)).toBeVisible();

  // Guests can still open the link, but there is nothing to add.
  const guest = await openGuestLink(browser, guestPath);
  await expect(guest.getByRole('heading', { name: UK.guestClosed })).toBeVisible();
  await expect(guest.getByRole('button', { name: UK.addFiles })).toHaveCount(0);
  await guest.context().close();

  // The operator grants a free plan in /ops.
  const operator = await browser.newPage({ locale: 'de-DE' });
  await signInAsOperator(operator, testInfo);
  await operator.getByRole('link', { name: 'Тарифи акаунтів' }).click();
  await operator.getByLabel('Електронна пошта акаунта').fill(email);
  await operator.getByRole('button', { name: 'Знайти' }).click();
  await expect(operator.getByRole('heading', { name: email })).toBeVisible();
  await expect(operator.getByText('Лише перегляд', { exact: true })).toBeVisible();
  await operator.getByRole('button', { name: 'Надати тариф' }).click();
  const dialog = operator.getByRole('dialog', { name: 'Надати безкоштовний тариф' });
  await dialog.getByLabel('Причина').fill('Тестовий акаунт');
  await dialog.getByRole('button', { name: 'Надати' }).click();
  await expect(operator.getByText('Тариф надано').first()).toBeVisible();
  await expect(operator.getByText('Безкоштовний тариф без терміну')).toBeVisible();
  await operator.close();

  await page.goto('/app');
  await expect(page.getByRole('button', { name: UK.newCollection })).toBeEnabled();
  await expect(page.getByText(UK.banner)).toHaveCount(0);
  const reopened = await openGuestLink(browser, guestPath);
  await expect(reopened.getByRole('button', { name: UK.addFiles })).toBeVisible();
  await reopened.context().close();
});
