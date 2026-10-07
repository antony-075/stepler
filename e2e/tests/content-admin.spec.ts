import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink, submitTextViaApi } from '../support/guest.js';

test.use({ locale: 'de-DE' });

/** An admin with a collection holding `bodies` as guest wishes (#001 first). */
async function withWishes(page: Page, browser: Browser, bodies: string[]) {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Ювілей');
  const guest = await openGuestLink(browser, await mainLinkPath(page, id));
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  for (const body of bodies) await submitTextViaApi(guest, id, body);
  await guest.context().close();
  await page.goto(`/app/collections/${id}`);
  await expect(page.getByRole('list', { name: 'Кадри колекції' })).toBeVisible();
  return id;
}

test.describe('collection content', () => {
  test('frames newest first; by frame number; the type filter and its empty state', async ({
    page,
    browser,
  }) => {
    const id = await withWishes(page, browser, ['Перше', 'Друге', 'Третє']);
    // The frames' own buttons: a tile's hover action («Видалити кадр 3») is a button too.
    const frames = page
      .getByRole('list', { name: 'Кадри колекції' })
      .getByRole('button', { name: /^Кадр / });
    await expect(frames).toHaveCount(3);
    await expect(frames.first()).toHaveAccessibleName(/^Кадр 3,/);
    await expect(page.getByRole('tab', { name: /^Вміст/ })).toHaveText('Вміст3');

    await page.getByRole('combobox', { name: 'Порядок' }).click();
    await page.getByRole('option', { name: 'За номером кадру' }).click();
    await expect(page).toHaveURL(`/app/collections/${id}?sort=frame`);
    await expect(frames.first()).toHaveAccessibleName(/^Кадр 1,/);

    await page.getByRole('radio', { name: /^Фото/ }).click();
    await expect(page.getByText('Фото поки немає')).toBeVisible();
    await page.getByRole('button', { name: 'Показати все' }).click();
    await expect(frames).toHaveCount(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('a 5000-character wish in the viewer never scrolls sideways at 360', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await withWishes(page, browser, ['Довге побажання '.repeat(320).slice(0, 5000)]);
    await page.getByRole('button', { name: /^Кадр 1,/ }).click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Back closes the viewer.
    await page.goBack();
    await expect(viewer).toBeHidden();
  });

  test('keyboard: Tab to a frame, Enter opens, → steps, Escape returns focus @desktop', async ({
    page,
    browser,
  }) => {
    await withWishes(page, browser, ['Перше', 'Друге']);
    const second = page.getByRole('button', { name: /^Кадр 2,/ });
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /#002/ })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: /#001/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Кадр 1,/ })).toBeFocused();
  });

  test('a type no live link allows, with nothing of it, is a locked chip with its reason', async ({
    page,
    browser,
  }) => {
    const id = await withWishes(page, browser, ['Перше']);
    const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
    const res = await page.request.patch(`/api/v1/guest-links/${main.id}`, {
      data: {
        permissions: {
          canUploadPhotos: true,
          canUploadVideos: false,
          canUploadDocuments: true,
          canSubmitText: true,
          canViewGallery: false,
          canDeleteOwn: false,
        },
      },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(res.status()).toBe(200);
    await page.reload();

    const videos = page.getByRole('radio', { name: /^Відео/ });
    await expect(videos).toHaveAttribute('aria-disabled', 'true');
    await expect(videos).toHaveAccessibleDescription('Жодне посилання не дозволяє додавати відео');
    // Playwright waits for an `aria-disabled` element to become enabled; a person can still press it.
    await videos.click({ force: true });
    await expect(videos).toHaveAttribute('aria-checked', 'false');
    await expect(page).toHaveURL(`/app/collections/${id}`);
    await expect(page.getByRole('tooltip')).toContainText('Жодне посилання не дозволяє');
    // Allowed (photos) and non-empty (texts) types stay open.
    await expect(page.getByRole('radio', { name: /^Фото/ })).not.toHaveAttribute('aria-disabled');
    await expect(page.getByRole('radio', { name: /^Тексти/ })).not.toHaveAttribute('aria-disabled');
  });

  test('«Оновити» brings frames added since the page loaded', async ({ page, browser }) => {
    const id = await withWishes(page, browser, ['Перше']);
    const frames = page.getByRole('list', { name: 'Кадри колекції' }).getByRole('button');
    await expect(frames).toHaveCount(1);
    const guest = await openGuestLink(browser, await mainLinkPath(page, id));
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await submitTextViaApi(guest, id, 'Друге');
    await guest.context().close();

    await page.getByRole('button', { name: 'Оновити' }).click();
    await expect(frames).toHaveCount(2);
    await expect(frames.first()).toHaveAccessibleName(/^Кадр 2,/);
    await expect(page.getByRole('status').filter({ hasText: 'Оновлено' })).toBeAttached();
  });

  test('from lg the viewer is a centred dialog, not full screen @desktop', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWishes(page, browser, ['Перше']);
    await page.getByRole('button', { name: /^Кадр 1,/ }).click();
    const box = (await page.getByRole('dialog', { name: /#001/ }).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(1100);
    expect(box.height).toBeLessThanOrEqual(900 * 0.85 + 1);
    expect(Math.round(box.x + box.width / 2)).toBe(720);
  });
});
