import { currentLegalVersion } from '@stepler/contracts';
import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const TITLES = { terms: 'Умови використання', privacy: 'Політика конфіденційності' } as const;
const LEGAL_NAV = 'Правові документи';

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
  test('reads without JavaScript, at 320px, with real headings and working footer links', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE', javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/legal/privacy');
    await expectDocument(page, 'privacy');
    expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page
      .getByRole('navigation', { name: LEGAL_NAV })
      .getByRole('link', { name: TITLES.terms })
      .click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
    await expectDocument(page, 'terms');
    await context.close();
  });

  test('the sign-in page footer links to both documents', async ({ page }) => {
    await page.goto('/login');
    const nav = page.getByRole('navigation', { name: LEGAL_NAV });
    await nav.getByRole('link', { name: TITLES.terms }).click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
    await expectDocument(page, 'terms');
    await page.goto('/login');
    await nav.getByRole('link', { name: TITLES.privacy }).click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);
    await expectDocument(page, 'privacy');
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
      notice.getByRole('link', { name: 'Умовами використання' }).click(),
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
