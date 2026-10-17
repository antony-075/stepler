import { currentLegalVersion } from '@stepler/contracts';
import { expect, type Page, test } from '@playwright/test';
import {
  ACCEPT_TERMS_UK,
  acceptLegalOnCard,
  confirmEmail,
  E2E_PASSWORD,
  newEmail,
  REGISTER_UK,
  signIn,
} from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { dropLegalAcceptances } from '../support/database.js';
import { latestAuthLink } from '../support/mailpit.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const TITLES = { terms: 'Умови використання', privacy: 'Політика конфіденційності' } as const;
const LEGAL_NAV = 'Правові документи';
/** The screen-reader note on every legal link (they all open in a new tab). */
const NEW_TAB = '(відкриється в новій вкладці)';

/** The h1, the meta line with the current version, and the draft banner exactly while a draft. */
async function expectDocument(page: Page, slug: keyof typeof TITLES) {
  const entry = currentLegalVersion(slug === 'terms' ? 'TERMS' : 'PRIVACY');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES[slug]);
  await expect(page.getByText(`Версія ${entry.version}`)).toBeVisible();
  await expect(page.locator(`time[datetime="${entry.effectiveDate}"]`)).toBeVisible();
  const note = page.getByRole('note');
  if (entry.draft) await expect(note).toHaveText('Чернетка — текст буде замінено');
  else await expect(note).toHaveCount(0);
}

test.describe('legal pages', () => {
  test('terms and privacy render with version, date and the draft banner', async ({ page }) => {
    await page.goto('/legal/terms');
    await expectDocument(page, 'terms');
    await expect(page).toHaveTitle('Умови використання · Stepler');
    await page.goto('/legal/privacy');
    await expectDocument(page, 'privacy');
    // The contact block comes from LEGAL_CONTACT_EMAIL (set for the e2e web server).
    const contact = page.getByRole('region', { name: 'Контакти' });
    await expect(contact.getByRole('link', { name: 'privacy@stepler.test' })).toHaveAttribute(
      'href',
      'mailto:privacy@stepler.test',
    );
    // The same address fills the text's placeholders.
    const article = page.locator('article');
    await expect(article).not.toContainText('[LEGAL_CONTACT_EMAIL]');
    await expect(article.getByRole('link', { name: 'privacy@stepler.test' }).first()).toBeVisible();
  });

  test('an English browser reads the English text', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of Service');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });

  test('an unknown document is 404', async ({ page }) => {
    const res = await page.goto('/legal/unknown');
    expect(res?.status()).toBe(404);
  });

  // Review Focus 4: a document, not an app.
  test('reads without JavaScript, at 320px, with real headings and a footer without a self-link', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE', javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/legal/privacy');
    await expectDocument(page, 'privacy');
    expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // The way back is the wordmark (home); the footer offers only the other document.
    await expect(page.getByRole('banner').getByRole('link', { name: 'stepler' })).toHaveAttribute(
      'href',
      '/',
    );
    const nav = page.getByRole('navigation', { name: LEGAL_NAV });
    await expect(nav.getByRole('link')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: TITLES.privacy })).toHaveCount(0);
    const terms = nav.getByRole('link', { name: `${TITLES.terms} ${NEW_TAB}` });
    await expect(terms).toHaveAttribute('target', '_blank');
    const [opened] = await Promise.all([context.waitForEvent('page'), terms.click()]);
    await opened.waitForLoadState();
    expect(opened.url()).toMatch(/\/legal\/terms$/);
    await expectDocument(opened, 'terms');
    await expect(
      opened.getByRole('navigation', { name: LEGAL_NAV }).getByRole('link', { name: TITLES.terms }),
    ).toHaveCount(0);
    await context.close();
  });

  test('the sign-in page footer links to both documents in new tabs', async ({ page, context }) => {
    await page.goto('/login');
    const nav = page.getByRole('navigation', { name: LEGAL_NAV });
    for (const slug of ['terms', 'privacy'] as const) {
      const link = nav.getByRole('link', { name: `${TITLES[slug]} ${NEW_TAB}` });
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await opened.waitForLoadState();
      expect(opened.url()).toMatch(new RegExp(`/legal/${slug}$`));
      await expectDocument(opened, slug);
      await opened.close();
    }
    await expect(page).toHaveURL(/\/login$/);
  });

  // Owner 2026-10-05: short labels on one line in the 240px sidebar and the 360px phone menu; the
  // accessible name still names the full document.
  test('the admin sidebar and phone menu link to both documents on one line', async ({
    page,
    baseURL,
    isMobile,
  }) => {
    await signIn(page, newEmail());
    if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
    const LOCALES = {
      uk: { label: LEGAL_NAV, menu: 'Відкрити меню', sheet: 'Розділи', newTab: NEW_TAB },
      en: {
        label: 'Legal documents',
        menu: 'Open menu',
        sheet: 'Sections',
        newTab: '(opens in a new tab)',
      },
    } as const;
    const LINKS = {
      uk: [
        { slug: 'terms', text: 'Умови', name: TITLES.terms },
        { slug: 'privacy', text: 'Конфіденційність', name: TITLES.privacy },
      ],
      en: [
        { slug: 'terms', text: 'Terms', name: 'Terms of Service' },
        { slug: 'privacy', text: 'Privacy', name: 'Privacy Policy' },
      ],
    } as const;
    for (const locale of ['uk', 'en'] as const) {
      const copy = LOCALES[locale];
      // The profile locale wins over the cookie on /app (ADR 0011).
      const res = await page.request.patch('/api/v1/me', {
        data: { locale },
        headers: { origin: baseURL! },
      });
      expect(res.status()).toBe(200);
      await page.goto('/app');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      let scope = page.locator('#admin-sidebar');
      if (isMobile) {
        await page.getByRole('button', { name: copy.menu }).click();
        scope = page.getByRole('dialog', { name: copy.sheet });
      }
      const nav = scope.getByRole('navigation', { name: copy.label });
      const links = nav.getByRole('link');
      await expect(links).toHaveText(LINKS[locale].map(({ text }) => text));
      for (const { slug, name } of LINKS[locale]) {
        const link = nav.getByRole('link', { name: `${name} ${copy.newTab}`, exact: true });
        await expect(link).toHaveAttribute('href', `/legal/${slug}`);
        await expect(link).toHaveAttribute('target', '_blank');
      }
      // One line: both links share a row, and neither wraps inside itself.
      const [first, second] = [await links.nth(0).boundingBox(), await links.nth(1).boundingBox()];
      expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
      expect(Math.abs(first!.height - second!.height)).toBeLessThan(2);
      expect(first!.height).toBeLessThan(30);
    }
  });

  // Review Focus 5: the guest's link token must not leak through the notice.
  test('the guest notice opens the terms in a new tab without a referrer or opener', async ({
    page,
    context,
  }) => {
    await signIn(page, newEmail());
    const collection = await createCollectionViaApi(page, 'Весілля Олі та Тараса');
    const res = await page.request.get(`/api/v1/collections/${collection.id}/guest-links`);
    const { items } = (await res.json()) as { items: { isDefault: boolean; url: string }[] };
    await page.goto(items.find((link) => link.isDefault)!.url);
    const addFiles = page.getByRole('button', { name: 'Додати фото й відео' });
    await expect(addFiles).toBeVisible();
    // The notice renders in the dock on phones and under the title from 640px: take the visible
    // one. Its link text is the sentence's own case («Умовами використання»).
    const notice = page.getByText(/Додаючи вміст/).locator('visible=true');
    const [legal] = await Promise.all([
      context.waitForEvent('page'),
      notice.getByRole('link', { name: `Умовами використання ${NEW_TAB}` }).click(),
    ]);
    await legal.waitForLoadState();
    expect(legal.url()).toMatch(/\/legal\/terms$/);
    await expect(legal.getByRole('heading', { level: 1 })).toHaveText(TITLES.terms);
    expect(await legal.evaluate(() => document.referrer)).toBe('');
    expect(await legal.evaluate(() => window.opener === null)).toBe(true);
    // The guest page kept its state.
    await expect(addFiles).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Весілля Олі та Тараса');
  });
});

test.describe('acceptance at sign-in (ADR 0016)', () => {
  test('registration: the submit waits for the box, the documents open in new tabs, the first sign-in lands on /app', async ({
    page,
    context,
  }) => {
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    const email = newEmail();
    await page.goto('/register');
    await page.getByLabel(REGISTER_UK.email).fill(email);
    await page.getByLabel(REGISTER_UK.password, { exact: true }).fill(E2E_PASSWORD);
    await page.getByLabel(REGISTER_UK.confirm).fill(E2E_PASSWORD);
    const submit = page.getByRole('button', { name: REGISTER_UK.submit });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAccessibleDescription('Поставте позначку, щоб продовжити.');

    // Review Focus 5: reading a document does not cost the typed address.
    const card = page.locator('form');
    const [terms] = await Promise.all([
      context.waitForEvent('page'),
      card.getByRole('link', { name: TITLES.terms }).click(),
    ]);
    await terms.waitForLoadState();
    expect(terms.url()).toMatch(/\/legal\/terms$/);
    expect(await terms.evaluate(() => window.opener === null)).toBe(true);
    await terms.close();
    await expect(page.getByLabel(REGISTER_UK.email)).toHaveValue(email);
    await expect(page.getByRole('checkbox', { name: REGISTER_UK.legal })).not.toBeChecked();

    await acceptLegalOnCard(page);
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByRole('heading', { name: REGISTER_UK.sent })).toBeVisible();
    // The acceptance was recorded with the registration (ADR 0016, ADR 0019).
    await confirmEmail(page, await latestAuthLink(email));
    await expect(page).toHaveURL(/\/app$/);
    expect(visited).not.toContain('/accept-terms');
    const me = (await (await page.request.get('/api/v1/me')).json()) as {
      legal: { accepted: boolean };
    };
    expect(me.legal.accepted).toBe(true);

    // «Акаунт» → «Правові документи» shows both acceptances.
    await page.goto('/app/account');
    const block = page.getByRole('region', { name: 'Правові документи' });
    await expect(block.getByText(/^Прийнято .+ \(версія v\d+\)$/)).toHaveCount(2);
    await expect(block.getByRole('link', { name: /Умови використання/ })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  test('an error carried back to /login is explained', async ({ page }) => {
    await page.goto('/login?error=LEGAL_ACCEPTANCE_REQUIRED');
    await expect(
      page.getByText('Щоб продовжити, прийміть Умови використання та Політику конфіденційності.'),
    ).toBeVisible();
  });

  test('/accept-terms: signed out → /login; accepted → /app', async ({ page }) => {
    await page.goto('/accept-terms');
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, newEmail());
    await page.goto('/accept-terms');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('an account without an acceptance lands on /accept-terms once, then uses the app', async ({
    page,
  }) => {
    const email = newEmail();
    await signIn(page, email);
    dropLegalAcceptances(email);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/accept-terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ACCEPT_TERMS_UK.title);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const gated = await page.request.get('/api/v1/collections');
    expect(gated.status()).toBe(403);

    // The submit is not disabled; without the box it explains and moves focus to the box.
    const box = page.getByRole('checkbox', { name: ACCEPT_TERMS_UK.checkbox });
    await page.getByRole('button', { name: ACCEPT_TERMS_UK.submit }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Поставте позначку, щоб продовжити.' }),
    ).toBeVisible();
    await expect(box).toBeFocused();

    await box.check();
    await page.getByRole('button', { name: ACCEPT_TERMS_UK.submit }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('[data-slot="account-block"]')).toContainText(email);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
    expect((await page.request.get('/api/v1/collections')).status()).toBe(200);
  });
});
