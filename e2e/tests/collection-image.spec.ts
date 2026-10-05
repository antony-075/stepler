import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  createCollectionViaApi,
  horizontalOverflow,
  publishGuestPageViaApi,
  setDraftCoverFromFrameViaApi,
  waitForContentProcessed,
  waitForImageReady,
} from '../support/collections.js';
import { mainLinkPath, openGuestLink } from '../support/guest.js';
import { fixture, uploadViaApi } from '../support/media.js';

// «Картинка колекції» (plan Task 24, ADR 0017): the owner's own image of a collection, set in
// «Параметри колекції» and shown on the dashboard card and in the share dialog; the initials
// otherwise, never the guest page's cover, and never anything guests load. Admin management is
// `@desktop`; the guest check runs everywhere. Ukrainian UI.
test.use({ locale: 'de-DE' });

const TITLE = 'Ювілей бабусі Галини';
const INITIALS = 'ЮБ';

const card = (page: Page) =>
  page.locator('[data-slot="collection-card"]').filter({ hasText: TITLE });
const markOf = (scope: ReturnType<Page['locator']>) =>
  scope.locator('[data-slot="collection-cover"]');
const imageCard = (page: Page) => page.locator('[data-slot="collection-image"]');

async function setUp(page: Page) {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, TITLE);
  return { id, path: await mainLinkPath(page, id) };
}

/** A guest adds one photo frame; returns once the worker made its thumbnail. */
async function guestPhoto(page: Page, browser: Browser, id: string, path: string) {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  const frame = await uploadViaApi(guest, id, 'photo.jpg');
  await waitForContentProcessed(page, id, 1);
  return { guest, frame };
}

async function openSettings(page: Page, id: string) {
  await page.goto(`/app/collections/${id}?tab=settings`);
  await expect(page.getByRole('heading', { level: 2, name: 'Картинка колекції' })).toBeVisible();
}

/** The settings card says the image is ready (the worker made the thumbnail; the tab polls). */
async function expectReady(page: Page) {
  await expect(imageCard(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(markOf(imageCard(page))).toHaveAttribute('data-state', 'image');
}

test.describe('collection image', () => {
  test('upload → the dashboard card and the share dialog show it; remove → the initials again @desktop', async ({
    page,
  }) => {
    const { id } = await setUp(page);
    await page.goto('/app');
    await expect(markOf(card(page))).toHaveText(INITIALS);

    await openSettings(page, id);
    await expect(imageCard(page)).toHaveAttribute('data-state', 'none');
    await expect(page.getByRole('button', { name: 'Прибрати' })).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Завантажити' }).click();
    await (await chooser).setFiles(fixture('photo.jpg'));
    await expectReady(page);

    await page.goto('/app');
    const mark = markOf(card(page));
    await expect(mark).toHaveAttribute('data-state', 'image');
    await expect(mark.locator('img')).toHaveJSProperty('complete', true);
    expect(
      await mark.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await expect(mark.locator('img')).toHaveAttribute('src', /\/collection-image\//);

    await card(page).getByRole('button', { name: 'Поділитися' }).click();
    const dialog = page.getByRole('dialog');
    await expect(markOf(dialog)).toHaveAttribute('data-state', 'image');
    await page.keyboard.press('Escape');

    await openSettings(page, id);
    await page.getByRole('button', { name: 'Прибрати' }).click();
    await page
      .getByRole('alertdialog', { name: 'Прибрати картинку колекції?' })
      .getByRole('button', { name: 'Прибрати' })
      .click();
    await expect(imageCard(page)).toHaveAttribute('data-state', 'none');
    await page.goto('/app');
    await expect(markOf(card(page))).toHaveText(INITIALS);
    await expect(markOf(card(page))).toHaveAttribute('data-state', 'initials');
  });

  test('«Вибрати з кадрів» copies a guest photo into the collection image @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const { guest } = await guestPhoto(page, browser, id, path);
    await guest.context().close();

    await openSettings(page, id);
    await page.getByRole('button', { name: 'Вибрати з кадрів' }).click();
    const picker = page.getByRole('dialog', { name: 'Виберіть фото' });
    await expect(
      picker.getByText(
        'Фото скопіюється: якщо гість його видалить, картинка колекції не зміниться.',
      ),
    ).toBeVisible();
    await picker.getByRole('button', { name: 'Кадр 1, фото' }).click();
    await picker.getByRole('button', { name: 'Вибрати' }).click();
    await expect(picker).toBeHidden();
    await expectReady(page);

    await page.goto('/app');
    await expect(markOf(card(page))).toHaveAttribute('data-state', 'image');
  });

  test('a guest page cover alone leaves the card on its initials @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const { guest, frame } = await guestPhoto(page, browser, id, path);
    await guest.context().close();
    await setDraftCoverFromFrameViaApi(page, id, frame.id);
    await publishGuestPageViaApi(page, id);
    await waitForImageReady(page, id, 'published');

    await page.goto('/app');
    await expect(markOf(card(page))).toHaveText(INITIALS);
    await expect(markOf(card(page))).toHaveAttribute('data-state', 'initials');
  });

  test('guests never load the collection image', async ({ page, browser }) => {
    const { id, path } = await setUp(page);
    const { guest, frame } = await guestPhoto(page, browser, id, path);
    await guest.context().close();
    const res = await page.request.post(`/api/v1/collections/${id}/image/from-frame`, {
      data: { contentItemId: frame.id },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(res.status()).toBe(200);
    await expect
      .poll(async () => {
        const detail = await page.request.get(`/api/v1/collections/${id}`);
        return ((await detail.json()) as { image: { status: string } | null }).image?.status;
      })
      .toBe('READY');

    const visitor = await openGuestLink(browser, path);
    const requested: string[] = [];
    visitor.on('request', (request) => requested.push(request.url()));
    await visitor.reload();
    await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible();
    await visitor.waitForLoadState('networkidle');
    expect(requested.filter((url) => url.includes('/collection-image/'))).toEqual([]);
    expect(await visitor.content()).not.toContain('/collection-image/');
    expect(await horizontalOverflow(visitor)).toBeLessThanOrEqual(0);
    await visitor.context().close();
  });
});
