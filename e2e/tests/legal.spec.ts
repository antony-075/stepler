import { currentLegalVersion } from '@stepler/contracts';
import { expect, type Page, test } from '@playwright/test';
import {
  ACCEPT_TERMS_UK,
  acceptLegalOnCard,
  newEmail,
  SIGN_IN_UK,
  signIn,
} from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { dropLegalAcceptances } from '../support/database.js';
import { latestMagicLink } from '../support/mailpit.js';

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
    await expect(page.getByRole('link', { name: 'privacy@stepler.test' })).toHaveAttribute(
      'href',
      'mailto:privacy@stepler.test',
    );
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

  test('the admin sidebar links to both documents in new tabs @desktop', async ({ page }) => {
    await signIn(page, newEmail());
    await page.goto('/app');
    const nav = page.locator('#admin-sidebar').getByRole('navigation', { name: LEGAL_NAV });
    for (const slug of ['terms', 'privacy'] as const) {
      const link = nav.getByRole('link', { name: `${TITLES[slug]} ${NEW_TAB}` });
      await expect(link).toHaveAttribute('href', `/legal/${slug}`);
      await expect(link).toHaveAttribute('target', '_blank');
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
  test('the card: buttons wait for the box, the documents open in new tabs, the first sign-in lands on /app', async ({
    page,
    context,
  }) => {
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    const email = newEmail();
    await page.goto('/login');
    await page.getByLabel(SIGN_IN_UK.email).fill(email);
    const submit = page.getByRole('button', { name: SIGN_IN_UK.submit });
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
    await expect(page.getByLabel(SIGN_IN_UK.email)).toHaveValue(email);
    await expect(page.getByRole('checkbox', { name: SIGN_IN_UK.legal })).not.toBeChecked();

    await acceptLegalOnCard(page);
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByRole('heading', { name: SIGN_IN_UK.sent })).toBeVisible();
    await page.goto(await latestMagicLink(email));
    // The mailbox owner accepts here, by signing in (ADR 0016): the line names both documents.
    const line = page.getByText(/^Продовжуючи, ви приймаєте/);
    await expect(line).toBeVisible();
    for (const [name, path] of [
      [TITLES.terms, '/legal/terms'],
      ['Політику конфіденційності', '/legal/privacy'],
    ] as const) {
      const docLink = line.getByRole('link', { name });
      await expect(docLink).toHaveAttribute('href', path);
      await expect(docLink).toHaveAttribute('target', '_blank');
    }
    const [privacy] = await Promise.all([
      context.waitForEvent('page'),
      line.getByRole('link', { name: 'Політику конфіденційності' }).click(),
    ]);
    await privacy.waitForLoadState();
    await expect(privacy.getByRole('heading', { level: 1 })).toHaveText(TITLES.privacy);
    await privacy.close();
    await page.getByRole('button', { name: SIGN_IN_UK.signIn }).click();
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
