import { expect, type Locator, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  createCollectionViaApi,
  horizontalOverflow,
  waitForContentProcessed,
} from '../support/collections.js';
import { mainLinkPath, openGuestLink, pickFiles } from '../support/guest.js';
import { pickedFile, uploadViaApi } from '../support/media.js';

// Media processing (PR D): the worker started by Playwright makes thumbnails, previews and
// posters; the admin's grid swaps them in without a reload. Ukrainian UI.
test.use({ locale: 'de-DE' });

/** Every `<img>` in `scope` has loaded real pixels. */
async function allDecoded(scope: Locator): Promise<boolean> {
  return scope
    .locator('img')
    .evaluateAll((imgs) =>
      imgs.every(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
      ),
    );
}

test.describe('media processing', () => {
  test('a guest uploads a photo and a video; the admin sees their thumbnails and its duration', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Весілля Олі та Тараса');
    const guest = await openGuestLink(browser, await mainLinkPath(page, id));
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await pickFiles(guest, [pickedFile('photo.jpg'), pickedFile('clip.mp4')]);
    await expect(guest.getByRole('heading', { name: 'Готово, ваші кадри' })).toBeVisible({
      timeout: 30_000,
    });
    await guest.context().close();

    // The admin opens the tab right away: frames still waiting are asked for again until the
    // worker is done, and swapped in place.
    await page.goto(`/app/collections/${id}`);
    const grid = page.getByRole('list', { name: 'Кадри колекції' });
    await expect(grid.getByRole('button')).toHaveCount(2);
    const thumbnails = grid.locator('img[src*="/derived/"]');
    await expect(thumbnails).toHaveCount(2, { timeout: 30_000 });
    await expect.poll(() => allDecoded(grid)).toBe(true);
    await expect(grid.locator('img[src*="/uploads/"]')).toHaveCount(0);
    await expect(grid.getByText('Готується прев’ю')).toHaveCount(0);
    // The video's frame carries its duration (shown where the label is wide enough).
    await expect(grid.getByText('0:01')).toBeAttached();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('a HEIC photo opens in the viewer as its preview; a video plays over its poster @desktop', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Ювілей');
    const guest = await openGuestLink(browser, await mainLinkPath(page, id));
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await uploadViaApi(guest, id, 'photo.heic');
    await uploadViaApi(guest, id, 'clip.mov');
    await guest.context().close();
    // This test is about the viewer; the in-place swap is the test above.
    await waitForContentProcessed(page, id, 2);

    await page.goto(`/app/collections/${id}`);
    const grid = page.getByRole('list', { name: 'Кадри колекції' });
    await expect(grid.locator('img[src*="/derived/"]')).toHaveCount(2, { timeout: 30_000 });

    await grid.getByRole('button', { name: /^Кадр 1,/ }).click();
    const photo = page.getByRole('dialog', { name: /#001/ }).getByRole('img', { name: 'Кадр 1' });
    await expect(photo).toHaveAttribute('src', /\/derived\/.+\/preview\.webp/);
    await expect
      .poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(320);

    await page.keyboard.press('ArrowLeft');
    const video = page.getByRole('dialog', { name: /#002/ }).locator('video');
    await expect(video).toHaveAttribute('poster', /\/derived\/.+\/poster\.webp/);
    await expect(page.getByRole('dialog', { name: /#002/ }).getByText('0:01')).toBeVisible();
  });
});
