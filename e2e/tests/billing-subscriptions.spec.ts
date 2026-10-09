import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { payAtLiqPayStub } from '../support/billing.js';
import { horizontalOverflow } from '../support/collections.js';
import { failRenewal, stopPlanForSwitch } from '../support/database.js';

// Billing M3 (ADR 0018, plan Task 18, owner decision B14): subscriptions through the real
// `LiqPayProvider`; only LiqPay's checkout page and server API are replaced
// (`support/billing.ts`, `support/liqpay-stub.ts`).

// Ukrainian copy: an unsupported browser language falls back to it.
test.use({ locale: 'de-DE' });

const card = (page: Page) => page.locator('[data-slot="subscription-card"]');
const plans = (page: Page) =>
  page.getByRole('region', { name: 'Підписка для організаторів подій' });

/** Subscribes the signed-in account to Pro monthly through the stubbed LiqPay page. */
async function subscribePro(page: Page): Promise<void> {
  await page.goto('/app/billing');
  await plans(page).getByTestId('plan-sub-pro').getByRole('button', { name: 'Оформити' }).click();
  const dialog = page.getByRole('dialog', { name: 'Оформити «Pro»' });
  const pay = dialog.getByRole('button', { name: 'Перейти до оплати' });
  await expect(pay).toBeDisabled();
  await expect(pay).toHaveAccessibleDescription('Позначте згоду на автоматичне списання.');
  await dialog
    .getByRole('checkbox', { name: /^Я погоджуюся на автоматичне щомісячне списання 500,00\s₴/ })
    .check();
  await payAtLiqPayStub(page, 'success');
  await pay.click();
  await expect(page).toHaveURL(/\/app\/billing\/return\?payment=/);
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  await page.goto('/app/billing');
  await expect(card(page).getByText('Діє', { exact: true })).toBeVisible();
}

test('pricing shows the plans monthly and yearly, signing in to subscribe', async ({ page }) => {
  await page.goto('/pricing');
  const section = plans(page);
  const pro = section.getByTestId('plan-sub-pro');
  await expect(pro.getByText(/^500,00\s₴$/)).toBeVisible();
  await expect(section.getByTestId('plan-sub-business').getByText(/^1\s200,00\s₴$/)).toBeVisible();
  await section.getByRole('radio', { name: 'Щороку' }).click();
  await expect(pro.getByText(/^5\s000,00\s₴$/)).toBeVisible();
  await expect(pro.getByText('/рік')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await pro.getByRole('link', { name: 'Увійти, щоб оформити' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('the subscribe dialog needs the auto-renewal consent; nothing overflows', async ({ page }) => {
  await signIn(page, newEmail());
  await page.goto('/app/billing');
  await plans(page).getByTestId('plan-sub-pro').getByRole('button', { name: 'Оформити' }).click();
  const dialog = page.getByRole('dialog', { name: 'Оформити «Pro»' });
  await expect(dialog.getByRole('button', { name: 'Перейти до оплати' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button', { name: 'Перейти до оплати' })).toBeEnabled();
  expect(await horizontalOverflow(page)).toBe(0);
  await dialog.getByRole('button', { name: 'Скасувати' }).first().click();
  expect(await horizontalOverflow(page)).toBe(0);
});

test('subscribe, preview an upgrade, schedule and withdraw a yearly switch, cancel @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  await subscribePro(page);
  await expect(card(page).getByText(/^Наступне списання /)).toBeVisible();
  await expect(card(page).getByText(/^500,00\s₴\/міс$/)).toBeVisible();

  // An upgrade is priced by the server for the rest of the period.
  await plans(page)
    .getByTestId('plan-sub-business')
    .getByRole('button', { name: 'Перейти на цей тариф' })
    .click();
  const upgrade = page.getByRole('dialog', { name: 'Перейти на «Business»' });
  await expect(upgrade.getByText(/^Доплата зараз: .+, далі 1\s200,00\s₴\/міс$/)).toBeVisible();
  await upgrade.getByRole('button', { name: 'Скасувати' }).first().click();

  // Monthly → yearly is scheduled for the period end; nothing is paid now (B14).
  await plans(page).getByRole('radio', { name: 'Щороку' }).click();
  await plans(page)
    .getByTestId('plan-sub-pro')
    .getByRole('button', { name: 'Перейти на цей тариф' })
    .click();
  const yearly = page.getByRole('dialog', { name: 'Перейти на «Pro»' });
  await expect(yearly.getByText(/^З .+ — щорічно, 5\s000,00\s₴$/)).toBeVisible();
  await expect(yearly.getByText(/^Зараз нічого не списується\./)).toBeVisible();
  await yearly.getByRole('button', { name: 'Запланувати зміну' }).click();
  await expect(page.getByText('Зміну тарифу заплановано').first()).toBeVisible();
  await expect(card(page).getByText(/^З .+ — щорічно, 5\s000,00\s₴$/)).toBeVisible();
  await card(page).getByRole('button', { name: 'Скасувати зміну' }).click();
  await expect(page.getByText('Зміну тарифу скасовано').first()).toBeVisible();
  await expect(card(page).getByText(/щорічно/)).toHaveCount(0);

  // Cancelling keeps access to the period end.
  await card(page).getByRole('button', { name: 'Скасувати підписку' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(/^Доступ збережеться до .+\. Після цього колекції/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Скасувати підписку' }).click();
  await expect(card(page).getByText('Скасовано', { exact: true })).toBeVisible();
  await expect(card(page).getByText(/^Скасовано\. Доступ до /)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Відновити підписку' })).toBeVisible();
});

test('the switch at the period end: confirm the yearly plan through LiqPay @desktop', async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await subscribePro(page);
  await plans(page).getByRole('radio', { name: 'Щороку' }).click();
  await plans(page)
    .getByTestId('plan-sub-pro')
    .getByRole('button', { name: 'Перейти на цей тариф' })
    .click();
  await page.getByRole('button', { name: 'Запланувати зміну' }).click();
  await expect(card(page).getByRole('button', { name: 'Скасувати зміну' })).toBeVisible();

  stopPlanForSwitch(email);
  await page.reload();
  const banner = page.getByRole('status').filter({ hasText: 'Підтвердіть оплату: Pro' });
  await expect(banner.getByText(/щорічно, 5\s000,00\s₴/)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Скасувати зміну' })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Змінити тариф' })).toBeDisabled();

  await banner.getByRole('button', { name: 'Підтвердити оплату' }).click();
  const dialog = page.getByRole('dialog', { name: 'Підтвердити «Pro»' });
  await expect(dialog.getByText('Новий період почнеться з оплати.')).toBeVisible();
  await dialog
    .getByRole('checkbox', { name: /^Я погоджуюся на автоматичне щорічне списання 5\s000,00\s₴/ })
    .check();
  await payAtLiqPayStub(page, 'success');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();

  await page.goto('/app/billing');
  await expect(card(page).getByText(/^5\s000,00\s₴\/рік$/)).toBeVisible();
  await expect(card(page).getByText('Діє', { exact: true })).toBeVisible();
  await expect(page.getByText(/Підтвердіть оплату: Pro/)).toHaveCount(0);
});

test('a renewal LiqPay could not charge: grace with its date, plan changes wait @desktop', async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await subscribePro(page);
  failRenewal(email);
  await page.reload();
  await expect(card(page).getByText('Очікує оплати', { exact: true })).toBeVisible();
  await expect(
    card(page).getByText(/^Не вдалося списати оплату\. LiqPay ще спробує/),
  ).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Змінити тариф' })).toBeDisabled();
  // Every other admin page carries the grace banner with its date.
  await page.goto('/app');
  await expect(page.getByText(/^Оплату тарифу не підтверджено — оплатіть до /)).toBeVisible();
});
