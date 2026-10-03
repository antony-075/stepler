import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { mainLinkPath, openGuestLink, submitTextViaApi } from '../support/guest.js';

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
    const frames = page.getByRole('list', { name: 'Кадри колекції' }).getByRole('button');
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
});
