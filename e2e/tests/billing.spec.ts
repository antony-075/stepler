import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { payAtLiqPayStub } from '../support/billing.js';
import { endPackWindow, endTrial } from '../support/database.js';
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

  // «Обрати тариф» opens «Тарифи» on the subscriptions (owner 2026-10-16); «Огляд» says the
  // account is read-only.
  await page.getByRole('link', { name: 'Обрати тариф' }).click();
  await expect(page).toHaveURL(/\/app\/billing\?tab=plans$/);
  await expect(page.getByRole('heading', { name: 'Тариф і оплата', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Підписка для організаторів подій', level: 2 }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await page.getByRole('tab', { name: 'Ваш тариф' }).click();
  await expect(page.getByText('Лише перегляд', { exact: true })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  // Guests can still open the link, but there is nothing to add.
  const guest = await openGuestLink(browser, guestPath);
  await expect(guest.getByRole('heading', { name: UK.guestClosed })).toBeVisible();
  await expect(guest.getByRole('button', { name: UK.addFiles })).toHaveCount(0);
  await guest.context().close();

  // The operator grants a free plan in /ops.
  const operator = await browser.newPage({ locale: 'de-DE' });
  await signInAsOperator(operator, testInfo);
  await operator.getByRole('link', { name: 'Оплати' }).click();
  await expect(operator).toHaveURL(/\/ops\/billing\/payments$/);
  await operator.getByRole('link', { name: 'Безкоштовні тарифи' }).click();
  await expect(operator).toHaveURL(/\/ops\/billing\/grants$/);
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

// Billing M2 (ADR 0018, plan Task 14): packs bought through the real `LiqPayProvider`; only
// LiqPay's endpoints are replaced (`support/billing.ts`, `support/liqpay-stub.ts`).

test('pricing is public: two packs with prices, signing in to buy', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Тарифи', level: 1 })).toBeVisible();
  const start = page.getByTestId('pack-pack-start');
  await expect(start.getByRole('heading', { name: 'Старт' })).toBeVisible();
  await expect(start.getByText(/^499\s₴$/)).toBeVisible();
  await expect(page.getByTestId('pack-pack-event').getByText(/^999\s₴$/)).toBeVisible();
  await expect(page.getByText(/Продовжити збір на 30 днів — 199\s₴/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await start.getByRole('link', { name: 'Увійти, щоб купити' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a pack for a trial collection: checkout, LiqPay, «Оплату отримано», the pack in force @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Весілля Олени');
  await page.goto(`/app/collections/${id}`);
  await page.getByRole('link', { name: 'Купити пакет для цієї колекції' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/billing\\?collection=${id}$`));

  await page.getByTestId('pack-pack-start').getByRole('button', { name: 'Купити «Старт»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Пакет «Старт»' });
  await expect(dialog.getByRole('radio', { name: 'Весілля Олени' })).toBeChecked();
  await expect(dialog.getByText(/^499\s₴$/)).toBeVisible();
  await payAtLiqPayStub(page, 'success');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();

  await expect(page).toHaveURL(/\/app\/billing\/return\?payment=/);
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  await page.getByRole('link', { name: 'Відкрити колекцію' }).click();
  await expect(page.getByText('Пакет «Старт»')).toBeVisible();
  await expect(page.getByText(/^Гості додають до /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продовжити збір на 30 днів' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Купити пакет для цієї колекції' })).toHaveCount(0);

  // The pack's collection under «Ваші пакети» on «Огляд», its payment on «Історія оплат».
  await page.goto('/app/billing');
  const yours = page.getByRole('region', { name: 'Ваші пакети' });
  await expect(yours.getByRole('link', { name: 'Весілля Олени' })).toBeVisible();
  await page.getByRole('tab', { name: 'Історія платежів' }).click();
  await expect(page).toHaveURL(/\/app\/billing\?tab=history$/);
  const row = page.locator('[data-slot="payment-row"]').filter({ hasText: 'Весілля Олени' });
  await expect(row.getByText('Оплачено', { exact: true })).toBeVisible();
});

test('a declined card: «Оплата не пройшла» and a way to try again @desktop', async ({ page }) => {
  await signIn(page, newEmail());
  await page.goto('/app/billing?pack=pack-event');
  const dialog = page.getByRole('dialog', { name: 'Пакет «Подія»' });
  await expect(dialog.getByRole('radio', { name: 'Нова колекція' })).toBeChecked();
  await dialog.getByLabel('Назва нової колекції').fill('Ювілей');
  await payAtLiqPayStub(page, 'failure');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплата не пройшла' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Спробувати ще раз' })).toBeVisible();
});

test('no answer yet: the return page waits on the bank and ignores its own URL @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  await page.goto('/app/billing?pack=pack-start');
  const dialog = page.getByRole('dialog', { name: 'Пакет «Старт»' });
  await dialog.getByLabel('Назва нової колекції').fill('Хрестини');
  await payAtLiqPayStub(page, 'processing');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(
    page.getByRole('heading', { name: 'Очікуємо підтвердження від банку' }),
  ).toBeVisible();
  // A forged `status=success` in the return URL changes nothing: only the API decides.
  await page.goto(`${page.url()}&status=success`);
  await expect(
    page.getByRole('heading', { name: 'Очікуємо підтвердження від банку' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toHaveCount(0);
});

test('a declined card sends no answer: after a while, pay the same order again @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  await page.goto('/app/billing?pack=pack-start');
  const dialog = page.getByRole('dialog', { name: 'Пакет «Старт»' });
  await dialog.getByLabel('Назва нової колекції').fill('Ювілей');
  const orderOf = await payAtLiqPayStub(page, 'declined');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(
    page.getByRole('heading', { name: 'Очікуємо підтвердження від банку' }),
  ).toBeVisible();
  // No spinner forever: the page says what it knows and offers the next step.
  await expect(page.getByRole('heading', { name: 'Оплату ще не підтверджено' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText('Гроші не списуються, доки LiqPay не підтвердить оплату.'),
  ).toBeVisible();
  const first = orderOf();

  await page.unrouteAll();
  const retried = await payAtLiqPayStub(page, 'success');
  await page.getByRole('button', { name: 'Спробувати ще раз' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  // The same LiqPay order was paid, not a second one.
  expect(retried()).toBe(first);
});

test('collecting ended: «Збір завершено», extend by 30 days, guests can add again @desktop', async ({
  page,
  browser,
}) => {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Випускний');
  const guestPath = await mainLinkPath(page, id);
  await page.goto(`/app/billing?pack=pack-start&collection=${id}`);
  await payAtLiqPayStub(page, 'success');
  await page
    .getByRole('dialog', { name: 'Пакет «Старт»' })
    .getByRole('button', { name: 'Перейти до оплати' })
    .click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();

  endPackWindow(id);
  await page.goto(`/app/collections/${id}`);
  await expect(page.getByText(/^Збір завершено \d/).first()).toBeVisible();
  const guest = await openGuestLink(browser, guestPath);
  await expect(guest.getByRole('button', { name: UK.addFiles })).toHaveCount(0);
  await guest.context().close();

  await page.unrouteAll();
  await payAtLiqPayStub(page, 'success');
  await page.getByRole('button', { name: 'Продовжити збір на 30 днів' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Продовжити збір на 30 днів' });
  await expect(confirm.getByText(/199\s₴/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();

  const reopened = await openGuestLink(browser, guestPath);
  await expect(reopened.getByRole('button', { name: UK.addFiles })).toBeVisible();
  await reopened.context().close();
});
