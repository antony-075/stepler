import { expect, type Locator, type Page, test } from '@playwright/test';
import { axeViolations } from '../support/axe.js';
import { E2E_PASSWORD, newEmail, REGISTER_UK, SIGN_IN_UK, signIn } from '../support/auth.js';
import { createCollectionViaApi } from '../support/collections.js';
import { mainLinkPath, openGuestLink } from '../support/guest.js';

// Launch checklist 2.5: axe-core (WCAG 2.2 A/AA) on the pages people meet first, in light and
// dark, with their error and open states; and the sign-in form by keyboard alone. Reduced motion,
// so no fade-in is caught half-way (that reads as low contrast).

test.use({ locale: 'de-DE', reducedMotion: 'reduce' });

const PUBLIC_PAGES = ['/', '/pricing', '/login', '/register', '/forgot-password', '/legal/terms'];

async function expectNoViolations(page: Page, where: string, within?: string) {
  expect(await axeViolations(page, within), where).toEqual([]);
}

/** A visible focus indicator: an outline or a ring (box-shadow), never neither. */
async function expectFocusVisible(target: Locator) {
  await expect(target).toBeFocused();
  const style = await target.evaluate((element) => {
    const css = getComputedStyle(element);
    return { outline: css.outlineStyle, width: css.outlineWidth, shadow: css.boxShadow };
  });
  const outlined = style.outline !== 'none' && style.width !== '0px';
  expect(outlined || style.shadow !== 'none', JSON.stringify(style)).toBe(true);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('public pages have no WCAG A/AA violations', async ({ page }) => {
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await expectNoViolations(page, path);
      }
    });

    test('sign-in and registration with their errors shown', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(SIGN_IN_UK.email).fill(newEmail());
      await page.getByLabel(SIGN_IN_UK.password, { exact: true }).fill('Wrong-pa55word!');
      await page.getByRole('button', { name: SIGN_IN_UK.submit, exact: true }).click();
      await expect(page.getByText(SIGN_IN_UK.invalidCredentials)).toBeVisible();
      await expectNoViolations(page, '/login with an error');

      await page.goto('/register');
      await page.getByLabel(REGISTER_UK.password, { exact: true }).fill('abc');
      await page.getByLabel(REGISTER_UK.confirm).fill('abd');
      await page.getByLabel(REGISTER_UK.email).click();
      await expect(page.getByText('Паролі не збігаються')).toBeVisible();
      await expectNoViolations(page, '/register with errors');
    });

    test('the landing menu on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Відкрити меню' }).click();
      await expect(page.getByRole('dialog', { name: 'Меню' })).toBeVisible();
      await expectNoViolations(page, '/ menu open', '[role="dialog"]');
    });

    test('the app, the account with its dialog, and the guest page', async ({ page, browser }) => {
      await signIn(page, newEmail());
      const collection = await createCollectionViaApi(page, 'Весілля');
      for (const path of ['/app', `/app/collections/${collection.id}`, '/app/account']) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await expectNoViolations(page, path);
      }
      await page.getByRole('button', { name: 'Видалити акаунт' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expectNoViolations(page, '/app/account deletion dialog', '[role="alertdialog"]');

      const guest = await openGuestLink(browser, await mainLinkPath(page, collection.id));
      await guest.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await expect(guest.locator('h1').first()).toBeVisible();
      await expectNoViolations(guest, 'guest page');
      await guest.context().close();
    });
  });
}

test('sign-in by keyboard alone, with focus always visible @desktop', async ({ page }) => {
  await page.goto('/login');
  const email = page.getByLabel(SIGN_IN_UK.email);
  const password = page.getByLabel(SIGN_IN_UK.password, { exact: true });
  await email.focus();
  await expectFocusVisible(email);
  await page.keyboard.type(newEmail());
  await page.keyboard.press('Tab');
  // «Забули пароль?» may sit between the label and the field; Tab until the field.
  for (
    let step = 0;
    step < 3 && !(await password.evaluate((el) => el === document.activeElement));
    step++
  ) {
    await expectFocusVisible(page.locator(':focus'));
    await page.keyboard.press('Tab');
  }
  await expectFocusVisible(password);
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press('Tab');
  await expectFocusVisible(page.getByRole('button', { name: 'Показати пароль' }));
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await page.keyboard.press('Tab');
  await expectFocusVisible(page.getByRole('button', { name: SIGN_IN_UK.submit, exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByText(SIGN_IN_UK.invalidCredentials)).toBeVisible();
});
