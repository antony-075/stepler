import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { payAtLiqPayStub } from '../support/billing.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { signInAsOperator } from '../support/operator.js';

// Billing M4 (ADR 0018, plan Tasks 20–21): the operator's payments, refunds and the offers
// editor in /ops. Refunds go through the real `LiqPayProvider` to the local LiqPay stub.

test.use({ locale: 'de-DE' });

async function buyStartPack(page: Page, title: string): Promise<void> {
  const { id } = await createCollectionViaApi(page, title);
  await page.goto(`/app/billing?collection=${id}`);
  await page.getByTestId('pack-pack-start').getByRole('button', { name: 'Купити «Старт»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Пакет «Старт»' });
  await payAtLiqPayStub(page, 'success');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
}

test('the operator refunds part of a pack: LiqPay, the payment and the owner’s history @desktop', async ({
  page,
  browser,
}, testInfo) => {
  const email = newEmail();
  await signIn(page, email);
  await buyStartPack(page, 'Ювілей тата');

  const operator = await browser.newPage({ locale: 'de-DE' });
  await signInAsOperator(operator, testInfo);
  await operator.getByRole('link', { name: 'Оплати' }).click();
  await expect(operator).toHaveURL(/\/ops\/billing\/payments$/);
  await expect(operator.getByRole('heading', { name: 'Платежі', level: 1 })).toBeVisible();
  await operator.getByLabel('Електронна пошта акаунта').fill(email);
  await operator.getByRole('button', { name: 'Показати' }).click();
  await expect(operator).toHaveURL(/\/ops\/billing\/payments\?email=/);
  await operator.getByRole('link', { name: email }).click();
  await expect(operator.getByRole('heading', { name: /^Платіж на 499/ })).toBeVisible();
  await expect(operator.getByText(/Можна повернути ще 499/)).toBeVisible();

  await operator.getByRole('button', { name: 'Повернути кошти' }).click();
  const dialog = operator.getByRole('dialog', { name: 'Повернути кошти' });
  const amount = dialog.getByLabel('Сума, грн');
  await expect(amount).toHaveValue('499,00');
  await amount.fill('300');
  await expect(dialog.getByText(/Буде повернено 300.+на картку покупця/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Повернути/ }).click();
  await expect(dialog.getByText('Вкажіть причину')).toBeVisible();
  await dialog.getByLabel('Причина').fill('Гостей було менше, ніж планували');
  await dialog.getByRole('button', { name: /^Повернути 300/ }).click();
  await expect(operator.getByText('Кошти повернено').first()).toBeVisible();
  await expect(operator.getByText('Повернено частково').first()).toBeVisible();
  await expect(operator.getByText(/Можна повернути ще 199/)).toBeVisible();
  await expect(operator.getByText('Гостей було менше, ніж планували')).toBeVisible();
  await operator.close();

  await page.goto('/app/billing?tab=history');
  await expect(
    page.locator('[data-slot="payment-row"]').getByText('Повернено частково', { exact: true }),
  ).toBeVisible();
});

test('the operator prices a new offer; it stays off sale until started @desktop', async ({
  page,
}, testInfo) => {
  await signInAsOperator(page, testInfo);
  await page.goto('/ops/billing/offers');
  await expect(page.getByRole('heading', { name: 'Тарифи і ціни', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Старт' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  const code = `pack-e2e-${Date.now().toString(36)}`;
  await page.getByRole('link', { name: 'Нова пропозиція' }).click();
  await page.getByLabel('Код', { exact: true }).fill(code);
  await page.getByLabel('Назва українською').fill('Випускний');
  await page.getByLabel('Назва англійською').fill('Graduation');
  await page.getByLabel('Обсяг однієї колекції, ГБ').fill('20');
  await page.getByLabel('Посилань для гостей на колекцію').fill('10');
  await page.getByLabel('Збір, днів').fill('14');
  await page.getByLabel('Зберігання, днів').fill('365');
  await page.getByRole('button', { name: 'Створити' }).click();
  const create = page.getByRole('dialog', { name: 'Створити пропозицію' });
  await create.getByLabel('Причина').fill('Пакет для випускних');
  await create.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('heading', { name: '«Випускний»', level: 1 })).toBeVisible();
  await expect(page.getByText('Не продається', { exact: true })).toBeVisible();

  await page.getByLabel('Ціна разово, грн').fill('749,50');
  await page.getByRole('button', { name: 'Зберегти ціну' }).click();
  const price = page.getByRole('dialog', { name: 'Змінити ціну' });
  await price.getByLabel('Причина').fill('Перша ціна');
  await price.getByRole('button', { name: 'Змінити ціну' }).click();
  await expect(page.getByText('Ціну змінено').first()).toBeVisible();
  await expect(page.getByText(/Зараз 749,50/)).toBeVisible();

  await page.getByRole('link', { name: 'До тарифів і цін' }).click();
  const row = page.getByRole('listitem').filter({ hasText: code });
  await expect(row.getByText(/749,50.+разово/)).toBeVisible();
  await expect(row.getByText('20 ГБ на колекцію', { exact: false })).toBeVisible();
  await expect(row.getByText('Не продається')).toBeVisible();
});
