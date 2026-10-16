import { expect, type Page, test } from '@playwright/test';

// The marketing landing at `/` (apps/web/src/landing), signed out, in Ukrainian (no supported
// browser language). Every link leads somewhere real, the menu, the template tabs, the steps and
// the questions work by keyboard and touch, and the page never scrolls sideways.
test.use({ locale: 'de-DE' });

const NAV = ['Як це працює', 'Оформлення', 'Приватність', 'Ціни', 'Питання'];

async function anchorTargetsExist(page: Page, hrefs: (string | null)[]) {
  for (const href of hrefs) {
    expect(href).toMatch(/^#[a-z]+$/);
    await expect(page.locator(href!)).toHaveCount(1);
  }
}

test('@desktop the header links to the sections, sign-in and the trial', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header').first();
  const nav = header.getByRole('navigation', { name: 'Розділи сторінки' });
  await expect(nav.getByRole('link')).toHaveText(NAV);
  await anchorTargetsExist(
    page,
    await nav
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  );
  await expect(header.getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
  await expect(header.getByRole('link', { name: 'Спробувати безкоштовно' })).toHaveAttribute(
    'href',
    '/register',
  );

  await nav.getByRole('link', { name: 'Питання' }).click();
  await expect(page).toHaveURL(/#faq$/);
  // The heading is not hidden under the sticky header.
  const top = await page.getByRole('heading', { level: 2, name: 'Часті питання' }).boundingBox();
  const headerBox = await header.boundingBox();
  expect(top!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
});

test('the hero says what it is and starts the trial', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Збирайте фото й відео з подій без клопотів' }),
  ).toBeVisible();
  const hero = page.locator('section[aria-labelledby="hero-title"]');
  await expect(hero.getByRole('link', { name: 'Спробувати 7 днів безкоштовно' })).toHaveAttribute(
    'href',
    '/register',
  );
  await expect(hero.getByRole('link', { name: 'Як це працює' })).toHaveAttribute('href', '#how');
  await expect(hero.getByText('Картка не потрібна — гроші самі не спишуться.')).toBeVisible();
});

test('the menu opens, traps focus, closes on Escape and on an anchor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Відкрити меню' });
  await open.click();
  const menu = page.getByRole('dialog', { name: 'Меню' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Спробувати безкоштовно' })).toHaveAttribute(
    'href',
    '/register',
  );
  await expect(menu.getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await menu.getByRole('link', { name: 'Ціни' }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#pricing$/);
});

test('the template tabs switch by keyboard and show the real template', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Дизайни сторінки для гостей' });
  await tabs.scrollIntoViewIfNeeded();
  const classic = tabs.getByRole('tab', { name: 'Класика' });
  await expect(classic).toHaveAttribute('aria-selected', 'true');
  await classic.focus();
  await page.keyboard.press('ArrowRight');
  const fullscreen = tabs.getByRole('tab', { name: 'На весь екран' });
  await expect(fullscreen).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'На весь екран' })).toContainText(
    'Ваше фото на весь екран',
  );
  await expect(
    page.getByRole('img', { name: 'Дизайн «На весь екран» на телефоні гостя' }),
  ).toBeVisible();
});

test('@desktop the steps show their real screens', async ({ page }) => {
  await page.goto('/');
  const steps = page.getByRole('tablist', { name: 'Кроки' });
  await steps.scrollIntoViewIfNeeded();
  await steps.getByRole('tab', { name: /Поділіться QR-кодом/ }).click();
  await expect(
    page.getByRole('img', { name: 'Вікно «Поділитися» з QR-кодом і посиланням для гостей' }),
  ).toBeVisible();
});

test('the walkthrough loads only when asked, with captions', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Відтворити відео «Stepler за пів хвилини»' }).click();
  const video = page.locator('video');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toBeFocused();
  for (const src of await video
    .locator('source, track')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')))) {
    expect((await request.get(src!)).status()).toBe(200);
  }
});

test('the questions open and close by keyboard', async ({ page }) => {
  await page.goto('/');
  const question = page.getByText('Фото втратять якість?');
  const answer = page.getByText('Ми зберігаємо фото й відео такими, якими їх зняли');
  await question.scrollIntoViewIfNeeded();
  await expect(answer).toBeHidden();
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(answer).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(answer).toBeHidden();
});

test('the pricing starts with the trial and links to the details', async ({ page }) => {
  await page.goto('/#pricing');
  const pricing = page.locator('#pricing');
  await expect(pricing.getByTestId('trial')).toContainText('0 ₴');
  await expect(pricing.getByRole('link', { name: 'Почати безкоштовно' })).toHaveAttribute(
    'href',
    '/register',
  );
  await expect(pricing.getByRole('link', { name: 'Усе про ціни' })).toHaveAttribute(
    'href',
    '/pricing',
  );
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the hero grid is simply there', async ({ page }) => {
    await page.goto('/');
    const tile = page.locator('.landing-gather').first();
    await expect(tile).toHaveCSS('animation-name', 'none');
    await expect(tile).toHaveCSS('opacity', '1');
  });
});

for (const width of [320, 390, 768, 1280]) {
  test(`at ${width}px nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('footer').last().scrollIntoViewIfNeeded();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}

// Sign-in, registration and the account steps share the landing's look (components/auth-page).
test.describe('the account pages', () => {
  for (const path of ['/login', '/register', '/forgot-password', '/auth/verify']) {
    test(`${path} has one h1 and never scrolls sideways at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 780 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      // Polled: the bot check first renders at its full width, then switches to the compact
      // widget once it has measured the narrow card.
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(0);
    });
  }

  test('@desktop sign-in and registration link to each other from the header', async ({ page }) => {
    await page.goto('/login');
    await page.locator('header').getByRole('link', { name: 'Зареєструватися' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await page.locator('header').getByRole('link', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('complementary', { name: 'З поверненням!' })).toBeVisible();
  });
});
