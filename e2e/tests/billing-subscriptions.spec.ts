import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { LIQPAY_CHECKOUT_URL, payAtLiqPayStub, postRenewalCallback } from '../support/billing.js';
import {
  archiveCollectionViaApi,
  createCollectionViaApi,
  horizontalOverflow,
} from '../support/collections.js';
import { endGrace, failRenewal, halfPeriodPassed, stopPlanForSwitch } from '../support/database.js';

// Billing M3 (ADR 0018, plan Task 18, owner decision B14): subscriptions through the real
// `LiqPayProvider`; only LiqPay's checkout page and server API are replaced
// (`support/billing.ts`, `support/liqpay-stub.ts`).

// Ukrainian copy: an unsupported browser language falls back to it.
test.use({ locale: 'de-DE' });

// «Ваш тариф» on «Огляд» (the plan and the subscription in one card since billing page v3).
const card = (page: Page) => page.locator('[data-slot="plan-card"]');
const openTab = (page: Page, name: 'Огляд' | 'Тарифи' | 'Історія оплат') =>
  page.getByRole('tab', { name }).click();
const plans = (page: Page) =>
  page.getByRole('region', { name: 'Підписка для організаторів подій' });

const PLANS = {
  'sub-pro': { title: 'Pro', consent: /^Я погоджуюся на автоматичне щомісячне списання 500,00\s₴/ },
  'sub-business': {
    title: 'Business',
    consent: /^Я погоджуюся на автоматичне щомісячне списання 1\s200,00\s₴/,
  },
} as const;

/**
 * Subscribes the signed-in account to a monthly plan through the stubbed LiqPay page. Returns
 * the subscription's LiqPay order id (its renewals arrive for it).
 */
async function subscribe(page: Page, code: keyof typeof PLANS = 'sub-pro'): Promise<string> {
  const { title, consent } = PLANS[code];
  // «Тарифи» shows one kind at a time; `#subscriptions` is «Обрати тариф» beside «Купити пакет».
  await page.goto('/app/billing?tab=plans#subscriptions');
  await plans(page).getByTestId(`plan-${code}`).getByRole('button', { name: 'Оформити' }).click();
  const dialog = page.getByRole('dialog', { name: `Оформити «${title}»` });
  const pay = dialog.getByRole('button', { name: 'Перейти до оплати' });
  await expect(pay).toBeDisabled();
  await expect(pay).toHaveAccessibleDescription('Позначте згоду на автоматичне списання.');
  await dialog.getByRole('checkbox', { name: consent }).check();
  const orderId = await payAtLiqPayStub(page, 'success');
  await pay.click();
  await expect(page).toHaveURL(/\/app\/billing\/return\?payment=/);
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  await page.unroute(LIQPAY_CHECKOUT_URL);
  await page.goto('/app/billing');
  await expect(card(page).getByText('Діє', { exact: true })).toBeVisible();
  return orderId();
}

const subscribePro = (page: Page): Promise<string> => subscribe(page, 'sub-pro');

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
  await page.goto('/app/billing?tab=plans');
  // «Тарифи» asks which kind fits; without a subscription it starts on the packs.
  const kind = page.getByRole('radiogroup', { name: 'Що вам підходить?' });
  await expect(kind.getByRole('radio', { name: 'Пакет на одну подію' })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Купити пакет' })).toBeVisible();
  await expect(plans(page)).toHaveCount(0);
  await kind.getByRole('radio', { name: 'Підписка для організаторів' }).click();
  await expect(page.getByRole('heading', { name: 'Купити пакет' })).toHaveCount(0);
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

  // An upgrade is priced by the server for the rest of the period. «Змінити тариф» opens «Тарифи».
  await card(page).getByRole('link', { name: 'Змінити тариф' }).click();
  await expect(page).toHaveURL(/\/app\/billing\?tab=plans$/);
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
  await openTab(page, 'Огляд');
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
  await expect(card(page).getByText(/^Доступ до /)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Відновити підписку' })).toBeVisible();
});

test('the switch at the period end: confirm the yearly plan through LiqPay @desktop', async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await subscribePro(page);
  await openTab(page, 'Тарифи');
  await plans(page).getByRole('radio', { name: 'Щороку' }).click();
  await plans(page)
    .getByTestId('plan-sub-pro')
    .getByRole('button', { name: 'Перейти на цей тариф' })
    .click();
  await page.getByRole('button', { name: 'Запланувати зміну' }).click();
  await openTab(page, 'Огляд');
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

test('renewals arrive from LiqPay; a failed one gives grace, «Оплатити зараз» pays again @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  const orderId = await subscribePro(page);
  const next = card(page).getByText(/^Наступне списання /);
  const firstDate = await next.textContent();

  // LiqPay charges the next month on its own: the period moves on by one month.
  await postRenewalCallback(page, orderId, 'success', 50_000);
  await page.reload();
  await expect(next).toBeVisible();
  expect(await next.textContent()).not.toBe(firstDate);
  await expect(card(page).getByText('Діє', { exact: true })).toBeVisible();

  // The following charge fails: grace with its date; plan changes wait for the payment.
  await postRenewalCallback(page, orderId, 'failure', 50_000);
  await page.reload();
  await expect(card(page).getByText('Очікує оплати', { exact: true })).toBeVisible();
  // The long explanation is «Огляд»'s one alert; the card keeps «Оплатіть до …».
  await expect(
    page.getByRole('status').filter({ hasText: /^Не вдалося списати оплату за новий період/ }),
  ).toBeVisible();
  await expect(card(page).getByText(/^Оплатіть до /)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Змінити тариф' })).toBeDisabled();

  // «Оплатити зараз»: a new LiqPay checkout of the same plan, the consent asked again.
  await card(page).getByRole('button', { name: 'Оплатити зараз' }).click();
  const dialog = page.getByRole('dialog', { name: 'Оплатити «Pro» зараз' });
  await expect(dialog.getByText(/^Попереднє списання зупинимо в LiqPay/)).toBeVisible();
  await dialog.getByRole('checkbox', { name: PLANS['sub-pro'].consent }).check();
  await payAtLiqPayStub(page, 'success');
  await dialog.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  await page.goto('/app/billing');
  await expect(card(page).getByText('Діє', { exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Оплатити зараз' })).toHaveCount(0);
});

test('a renewal never paid: grace with its date, then read-only @desktop', async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await subscribePro(page);
  failRenewal(email);
  await page.reload();
  await expect(card(page).getByText('Очікує оплати', { exact: true })).toBeVisible();
  // Every other admin page carries the grace banner with its date.
  await page.goto('/app');
  await expect(page.getByText(/^Оплату тарифу не підтверджено — оплатіть до /)).toBeVisible();

  endGrace(email);
  await page.reload();
  await expect(
    page.getByText('Тариф завершився — колекції доступні лише для перегляду'),
  ).toBeVisible();
  // Until the job ends the plan, the card says the grace is over and paying still works.
  await page.goto('/app/billing');
  await expect(card(page).getByText(/^Пільговий період завершився/)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Оплатити зараз' })).toBeVisible();
});

test('an upgrade half-way is prorated and paid; the new limits at once @desktop', async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await subscribePro(page);
  halfPeriodPassed(email);
  await page.reload();
  await openTab(page, 'Тарифи');
  await plans(page)
    .getByTestId('plan-sub-business')
    .getByRole('button', { name: 'Перейти на цей тариф' })
    .click();
  const upgrade = page.getByRole('dialog', { name: 'Перейти на «Business»' });
  // (1 200 − 500) ₴ for about half a month.
  await expect(
    upgrade.getByText(/^Доплата зараз: 3\d\d,\d\d\s₴, далі 1\s200,00\s₴\/міс$/),
  ).toBeVisible();
  await payAtLiqPayStub(page, 'success');
  await upgrade.getByRole('button', { name: 'Перейти до оплати' }).click();
  await expect(page.getByRole('heading', { name: 'Оплату отримано' })).toBeVisible();
  await page.goto('/app/billing');
  await expect(card(page).getByRole('heading', { name: 'Business' })).toBeVisible();
  await expect(card(page).getByText(/^1\s200,00\s₴\/міс$/)).toBeVisible();
});

test('a downgrade that does not fit lists what to reduce; once it fits it is scheduled @desktop', async ({
  page,
}) => {
  await signIn(page, newEmail());
  await subscribe(page, 'sub-business');
  const created = [];
  for (let i = 1; i <= 6; i += 1) created.push(await createCollectionViaApi(page, `Подія ${i}`));
  await page.reload();
  await openTab(page, 'Тарифи');

  const toPro = () =>
    plans(page)
      .getByTestId('plan-sub-pro')
      .getByRole('button', { name: 'Перейти на цей тариф' })
      .click();
  await toPro();
  const dialog = page.getByRole('dialog', { name: 'Перейти на «Pro»' });
  await expect(dialog.getByText('Щоб перейти на «Pro», спершу:')).toBeVisible();
  await expect(dialog.getByText('Архівуйте або видаліть 1 колекцію')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Запланувати зміну' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Закрити' }).first().click();

  await archiveCollectionViaApi(page, created[0]?.id ?? '');
  await toPro();
  await expect(dialog.getByText(/^З .+: Pro, 500,00\s₴\/міс$/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Запланувати зміну' }).click();
  await expect(page.getByText('Зміну тарифу заплановано').first()).toBeVisible();
  await openTab(page, 'Огляд');
  await expect(card(page).getByText(/^З .+: Pro, 500,00\s₴\/міс$/)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Скасувати зміну' })).toBeVisible();
});
