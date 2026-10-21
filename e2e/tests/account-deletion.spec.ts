import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, newEmail, signIn } from '../support/auth.js';
import {
  archiveCollectionViaApi,
  createCollectionViaApi,
  horizontalOverflow,
} from '../support/collections.js';
import { latestAuthLink, messageIds } from '../support/mailpit.js';

// Self-service account deletion (ADR 0020): «Акаунт» mails a link; the link's page, in any
// browser, lists what goes and deletes; the old session and password stop working.

test.use({ locale: 'de-DE' });

test('«Видалити акаунт» → the mailed link deletes the account and its collections', async ({
  page,
  browser,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await createCollectionViaApi(page, 'Весілля');
  const archived = await createCollectionViaApi(page, 'Хрестини');
  await archiveCollectionViaApi(page, archived.id);

  await page.goto('/app/account');
  const seen = await messageIds(email);
  await page.getByRole('button', { name: 'Видалити акаунт' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Надіслати лист для видалення?' });
  await expect(dialog).toContainText(email);
  await dialog.getByRole('button', { name: 'Надіслати лист' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Лист надіслано на ${email}.`)).toBeVisible();
  const link = await latestAuthLink(email, 'delete', 15_000, seen);

  // Opened signed out, as from a mail app.
  const other = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  await other.goto(link);
  await expect(other.getByRole('heading', { name: 'Видалити акаунт назавжди?' })).toBeVisible();
  await expect(other.getByText(`Акаунт ${email}.`)).toBeVisible();
  await expect(other.getByText(/^2 колекції разом з усіма кадрами/)).toBeVisible();
  await other.getByRole('button', { name: 'Видалити акаунт назавжди' }).click();
  await expect(other.getByRole('heading', { name: 'Акаунт видалено' })).toBeVisible();

  // The link works once.
  await other.goto(link);
  await expect(other.getByRole('heading', { name: 'Посилання не спрацювало' })).toBeVisible();
  await other.context().close();

  // The first browser's session is gone, and so is the password.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
  const login = await page.request.post('/api/v1/auth/login', {
    data: { email, password: E2E_PASSWORD },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(login.status()).toBe(401);
});

test('the deletion page fits a 360px phone and a broken link says what to do', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/delete-account?token=not-a-token');
  await expect(page.getByRole('heading', { name: 'Посилання не спрацювало' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'До акаунта' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
