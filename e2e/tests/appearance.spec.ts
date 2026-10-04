import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  createCollectionViaApi,
  horizontalOverflow,
  setCoverFromFrameViaApi,
  updateCollectionViaApi,
  waitForCoverReady,
} from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink } from '../support/guest.js';
import { fixture, uploadViaApi } from '../support/media.js';

// Slice 8a: the collection's cover and welcome message («Гостьова сторінка»). Admin-only management is
// `@desktop`; what guests see, and the tab at phone width, run on all three projects. The worker
// started by Playwright makes the cover's thumbnail and preview. Ukrainian UI.
test.use({ locale: 'de-DE' });

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });
const toast = (page: Page) => page.locator('[data-slot="toast-title"]');
const coverIn = (scope: Locator | Page) => scope.locator('[data-slot="collection-cover"]');

/** The `<img>` in `cover` has loaded real pixels. */
const decoded = (cover: Locator) =>
  cover
    .locator('img')
    .evaluate(
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    );

/** An admin with one collection whose main link lets guests delete their own frames. */
async function setUp(page: Page, title = 'Весілля Олі та Тараса') {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, title);
  const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
  const res = await page.request.patch(`/api/v1/guest-links/${main.id}`, {
    data: {
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: true,
        canDeleteOwn: true,
      },
    },
    headers: origin(page),
  });
  expect(res.status()).toBe(200);
  return { id, path: await mainLinkPath(page, id) };
}

async function asGuest(browser: Browser, path: string): Promise<Page> {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  return guest;
}

test.describe('collection appearance', () => {
  test('a HEIC cover uploads, shows «Готується», then the card and the tab show it; removing brings the initials back @desktop', async ({
    page,
  }) => {
    const { id } = await setUp(page);
    await page.goto(`/app/collections/${id}?tab=appearance`);
    await expect(page.getByRole('tab', { name: 'Гостьова сторінка' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const card = page.locator('[data-slot="cover-card"]');
    await expect(card).toHaveAttribute('data-state', 'none');
    await expect(coverIn(card)).toHaveAttribute('data-state', 'initials');

    await card.locator('[data-slot="cover-file-input"]').setInputFiles(fixture('photo.heic'));
    await expect(toast(page).filter({ hasText: 'Обкладинку завантажено — готується' })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    // Until the worker is done the tab says so and never draws a broken image.
    await expect
      .poll(async () => card.getAttribute('data-state'), { timeout: 30_000 })
      .toMatch(/processing|ready/);
    await expect(card).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(coverIn(card)).toHaveAttribute('data-state', 'image');
    await expect.poll(() => decoded(coverIn(card))).toBe(true);

    await page.goto('/app');
    const tile = coverIn(page.locator('[data-slot="collection-card"]'));
    await expect(tile).toHaveAttribute('data-state', 'image');
    await expect.poll(() => decoded(tile)).toBe(true);

    await page.goto(`/app/collections/${id}?tab=appearance`);
    await page.getByRole('button', { name: 'Видалити обкладинку' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Видалити обкладинку?' });
    await confirm.getByRole('button', { name: 'Видалити' }).click();
    await expect(toast(page).filter({ hasText: 'Обкладинку видалено' })).toBeVisible();
    await expect(card).toHaveAttribute('data-state', 'none');

    await page.goto('/app');
    await expect(coverIn(page.locator('[data-slot="collection-card"]'))).toHaveAttribute(
      'data-state',
      'initials',
    );
  });

  test('«Зробити обкладинкою» in the viewer; the picker lists the frame @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await uploadViaApi(guest, id, 'photo.jpg');
    await guest.context().close();

    await page.goto(`/app/collections/${id}`);
    const grid = page.getByRole('list', { name: 'Кадри колекції' });
    await expect(grid.locator('img')).toHaveCount(1, { timeout: 30_000 });
    await grid.getByRole('button', { name: /^Кадр 1,/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Зробити обкладинкою' }).click();
    await expect(toast(page).filter({ hasText: 'Обкладинку оновлено' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto(`/app/collections/${id}?tab=appearance`);
    const card = page.locator('[data-slot="cover-card"]');
    await expect(card).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Замінити' }).click();
    await page.getByRole('menuitem', { name: 'Вибрати з кадрів' }).click();
    const picker = page.getByRole('dialog', { name: 'Виберіть фото для обкладинки' });
    const photos = picker.getByRole('list', { name: 'Фото гостей' });
    await expect(photos.getByRole('button', { name: 'Кадр 1, фото' })).toBeVisible();
    await photos.getByRole('button', { name: 'Кадр 1, фото' }).click();
    await expect(photos.getByRole('button', { name: 'Кадр 1, фото' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await picker.getByRole('button', { name: 'Зробити обкладинкою' }).click();
    await expect(picker).toBeHidden();
    await expect(toast(page).filter({ hasText: 'Обкладинку оновлено' }).first()).toBeVisible();
  });

  test('guests see the cover above the title and the welcome message; nothing scrolls sideways', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const welcome = `Дякуємо, що ви з нами! ${'Додавайте фото з вечора, '.repeat(6)}`.slice(0, 160);
    await updateCollectionViaApi(page, id, { welcomeMessage: welcome });
    const guest = await asGuest(browser, path);
    // No cover yet: no hero; the welcome is there already.
    await expect(coverIn(guest)).toHaveCount(0);
    await expect(guest.locator('[data-slot="guest-welcome"]')).toHaveText(welcome.trim());

    const frame = await uploadViaApi(guest, id, 'photo.jpg');
    await setCoverFromFrameViaApi(page, id, frame.id);
    await waitForCoverReady(page, id);
    await guest.reload();
    const hero = coverIn(guest);
    await expect(hero).toHaveAttribute('data-state', 'image');
    await expect.poll(() => decoded(hero)).toBe(true);
    const heroBox = (await hero.boundingBox())!;
    const titleBox = (await guest.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(titleBox.y);
    await expect(guest.locator('[data-slot="guest-welcome"]')).toBeVisible();
    expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);
    await guest.context().close();
  });

  test('the «Гостьова сторінка» tab fits the screen; the picker opens with a 44px action', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await uploadViaApi(guest, id, 'photo.jpg');
    await guest.context().close();

    await page.goto(`/app/collections/${id}?tab=appearance`);
    await expect(page.locator('[data-slot="cover-card"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Вибрати з кадрів' }).click();
    const picker = page.getByRole('dialog', { name: 'Виберіть фото для обкладинки' });
    await expect(picker.getByRole('button', { name: 'Кадр 1, фото' })).toBeVisible({
      timeout: 30_000,
    });
    const confirm = picker.locator('[data-slot="cover-picker-confirm"]');
    expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('the four tab labels are never cut at 768, 1024 and 1440 @desktop', async ({ page }) => {
    const { id } = await setUp(page);
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/app/collections/${id}?tab=appearance`);
      const tabs = page.getByRole('tablist', { name: 'Розділи колекції' });
      await expect(tabs.getByRole('tab', { name: 'Гостьова сторінка' })).toBeVisible();
      const cut = await tabs
        .locator('[role="tab"] > span:not([data-slot])')
        .evaluateAll((labels) =>
          labels.filter((label) => label.scrollWidth > label.clientWidth).map((l) => l.textContent),
        );
      expect(cut, `cut labels at ${width}px`).toEqual([]);
    }
  });

  test('the cover stays when the guest deletes the frame it came from', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    const frame = await uploadViaApi(guest, id, 'photo.jpg');
    await setCoverFromFrameViaApi(page, id, frame.id);
    await waitForCoverReady(page, id);

    // The guest deletes that frame from «Ваші кадри».
    await guest.reload();
    await guest
      .getByRole('list', { name: 'Ваші кадри' })
      .getByRole('button', { name: /^Кадр 1,/ })
      .click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Видалити' }).click();
    await guest
      .getByRole('alertdialog', { name: 'Видалити кадр #001?' })
      .getByRole('button', { name: 'Видалити' })
      .click();
    await expect(guest.getByText('Кадр видалено', { exact: true })).toBeVisible();
    await guest.context().close();

    await page.goto('/app');
    const tile = coverIn(page.locator('[data-slot="collection-card"]'));
    await expect(tile).toHaveAttribute('data-state', 'image');
    await expect.poll(() => decoded(tile)).toBe(true);
  });
});
