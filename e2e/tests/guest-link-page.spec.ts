import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  archiveCollectionViaApi,
  createCollectionViaApi,
  horizontalOverflow,
} from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

type Link = { id: string; isDefault: boolean; url: string | null };

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

async function links(page: Page, collectionId: string): Promise<Link[]> {
  const res = await page.request.get(`/api/v1/collections/${collectionId}/guest-links`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { items: Link[] }).items;
}

async function post(page: Page, path: string, data?: unknown): Promise<Link> {
  const res = await page.request.post(`/api/v1${path}`, { data, headers: origin(page) });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Link;
}

/** An admin with one collection; returns its default link's URL (a guest page path). */
async function setUp(page: Page, title: string) {
  await signIn(page, newEmail());
  const collection = await createCollectionViaApi(page, title, 'Субота, 14 червня.');
  const main = (await links(page, collection.id)).find((link) => link.isDefault)!;
  return { collection, main, url: main.url! };
}

test.describe('guest link page', () => {
  test('a live link shows the collection, with no-referrer and noindex headers', async ({
    page,
  }) => {
    const { url } = await setUp(page, 'Весілля Олі та Тараса');
    const res = await page.goto(url);
    expect(res?.headers()['referrer-policy']).toBe('no-referrer');
    expect(res?.headers()['x-robots-tag']).toBe('noindex');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Весілля Олі та Тараса');
    await expect(page.getByText('Субота, 14 червня.')).toBeVisible();
    // The main link is contribution-only: the guest learns who sees what they add.
    await expect(page.getByText('Ваші кадри побачить лише організатор')).toBeVisible();
    // Never the token or the title in the tab title.
    await expect(page).toHaveTitle('Stepler');
    // No file button until uploads exist (rule 18): the wish is the main action.
    await expect(page.getByRole('button', { name: /Додати фото/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Написати побажання' }).first()).toBeVisible();
  });

  test('the header language select switches the guest page to English', async ({ page }) => {
    const { url } = await setUp(page, 'Весілля Олі та Тараса');
    await page.goto(url);
    await expect(page.getByText('Ваші кадри побачить лише організатор')).toBeVisible();
    await page.getByRole('combobox', { name: 'Мова' }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page.getByText('Only the organiser will see what you add')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Language' })).toContainText('English');
  });

  for (const width of [768, 1024, 1440, 1920]) {
    test(`at ${width}px the action sits with the title, no dock, no sideways scroll @desktop`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const { url } = await setUp(page, 'Весілля Олі та Тараса');
      await page.goto(url);
      const write = page.getByRole('button', { name: 'Написати побажання' });
      await expect(write).toHaveCount(1);
      const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const action = (await write.boundingBox())!;
      // Under the title, in the first screen, never floating at the bottom of the window.
      expect(action.y).toBeGreaterThan(title.y);
      expect(action.y + action.height).toBeLessThan(900);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('pausing hides the title; rotating retires the old URL', async ({ page }) => {
    const { collection, main, url } = await setUp(page, 'Ювілей бабусі Галини');
    await post(page, `/guest-links/${main.id}/deactivate`);
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Посилання призупинене');
    await expect(page.getByText('Ювілей бабусі Галини')).toHaveCount(0);

    await page.goto('/app');
    await post(page, `/guest-links/${main.id}/activate`);
    const next = await post(page, `/collections/${collection.id}/guest-links/default/rotate`, {
      expectedLinkId: main.id,
    });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Посилання більше не діє');
    await page.goto(next.url!);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ювілей бабусі Галини');
  });

  test('a revoked additional link and an archived collection each say so', async ({ page }) => {
    const { collection, url } = await setUp(page, 'Хрестини');
    const extra = await post(page, `/collections/${collection.id}/guest-links`, {
      label: 'Фотограф',
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: false,
        canSubmitText: false,
        canViewGallery: false,
        canDeleteOwn: true,
      },
    });
    const extraUrl = extra.url!;
    await post(page, `/guest-links/${extra.id}/revoke`);
    await page.goto(extraUrl);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Посилання більше не діє');

    await page.goto('/app');
    await archiveCollectionViaApi(page, collection.id);
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Колекцію закрито');
  });

  test('an unknown link is «not found»', async ({ page }) => {
    await page.goto('/g/nonsense');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сторінку не знайдено');
  });

  test('a 100-character title never scrolls sideways at 320 and 360', async ({ page }) => {
    const title = `${'Велике'.repeat(16)}Свято`.slice(0, 100);
    const { url } = await setUp(page, title);
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    }
  });
});
