import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  archiveCollectionViaApi,
  createCollectionViaApi,
  horizontalOverflow,
} from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  pageTitle: 'Колекції',
  emptyTitle: 'Почніть з першої колекції',
  newCollection: 'Нова колекція',
  title: 'Назва',
  description: 'Опис',
  create: 'Створити',
  created: 'Колекцію створено',
  active: 'Активна',
  archived: 'В архіві',
  archive: 'Архів',
  back: 'Колекції',
  limitTitle: 'Ліміт активних колекцій вичерпано',
  settings: 'Налаштування',
  settingsTitle: 'Налаштування колекції',
  save: 'Зберегти',
  saved: 'Збережено',
  archiveAction: 'Архівувати',
  archivedTitle: 'Колекцію заархівовано',
  unarchive: 'Повернути з архіву',
  deleteAction: 'Видалити колекцію',
  deleteConfirm: 'Видалити назавжди',
  deleted: 'Колекцію видалено',
  contentEmpty: 'Тут з’являться фото, відео й побажання гостей',
  notFound: 'Колекцію не знайдено',
};

const LIMIT_ERROR = 'Досягнуто ліміту активних колекцій. Заархівуйте одну, щоб звільнити місце.';

const toast = (page: Page) => page.locator('[data-slot="toast-title"]');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

test.describe('dashboard', () => {
  test('a new admin creates their first collection through the dialog', async ({ page }) => {
    await signIn(page, newEmail());
    await expect(page.getByRole('heading', { name: T.pageTitle, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: T.emptyTitle })).toBeVisible();
    await expect(page.getByText('0 з 3 активних колекцій')).toBeVisible();
    // One invitation, one action: the header drops its own "New collection" while empty.
    await expect(page.getByRole('button', { name: T.newCollection })).toHaveCount(1);
    const steps = page.getByRole('list', { name: 'Як це працює' }).getByRole('listitem');
    // The step numbers are drawn (aria-hidden); the list itself carries the order.
    await expect(steps).toHaveText([
      /Створіть колекцію$/,
      /Поділіться посиланням або QR-кодом$/,
      /Гості додають фото, відео й побажання$/,
    ]);

    await page.getByRole('button', { name: T.newCollection }).click();
    const dialog = page.getByRole('dialog', { name: T.newCollection });
    await expect(dialog.getByLabel(T.title)).toBeFocused();
    await dialog.getByLabel(T.title).fill('Весілля Олі та Тараса');
    await dialog.getByLabel(T.description).fill('Субота, 14:00');
    // The counter is data in Geist Mono, grouped the Ukrainian way (a no-break space).
    await expect(dialog.getByText(/^13 \/ 1\s000$/)).toBeVisible();
    await dialog.getByRole('button', { name: T.create }).click();

    await expect(page).toHaveURL(new RegExp(`/app/collections/${UUID.source}$`));
    await expect(toast(page)).toHaveText(T.created);
    await expect(
      page.getByRole('heading', { name: 'Весілля Олі та Тараса', level: 1 }),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    const card = page.getByRole('article').filter({ hasText: 'Весілля Олі та Тараса' });
    await expect(card.getByText(T.active, { exact: true })).toBeVisible();
    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();
  });

  test('the create dialog explains the empty title instead of sending it', async ({ page }) => {
    await signIn(page, newEmail());
    await page.getByRole('button', { name: T.newCollection }).click();
    const dialog = page.getByRole('dialog', { name: T.newCollection });
    await dialog.getByRole('button', { name: T.create }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Введіть назву');
    await expect(dialog.getByLabel(T.title)).toHaveAttribute('aria-invalid', 'true');
  });

  test('active and archived collections are listed apart, with a link per card', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    const kept = await createCollectionViaApi(page, 'Ювілей бабусі', 'Рядок 1\nРядок 2');
    const old = await createCollectionViaApi(page, 'Випускний 2025');
    await archiveCollectionViaApi(page, old.id);
    await page.reload();

    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();
    const archive = page.getByRole('region', { name: T.archive });
    await expect(
      archive.getByRole('link', { name: 'Випускний 2025', exact: true }),
    ).toHaveAttribute('href', `/app/collections/${old.id}`);
    await expect(archive.getByText(T.archived, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ювілей бабусі', exact: true })).toHaveAttribute(
      'href',
      `/app/collections/${kept.id}`,
    );
  });

  test('settings open straight from a card, active or archived', async ({ page }) => {
    await signIn(page, newEmail());
    const kept = await createCollectionViaApi(page, 'Ювілей бабусі');
    const old = await createCollectionViaApi(page, 'Випускний 2025');
    await archiveCollectionViaApi(page, old.id);
    await page.reload();

    const archived = page.getByRole('link', { name: 'Налаштування колекції «Випускний 2025»' });
    await expect(archived).toHaveAttribute('href', `/app/collections/${old.id}/settings`);
    const box = await archived.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // The settings link sits above the card's stretched link, so a click lands on it.
    await page.getByRole('link', { name: 'Налаштування колекції «Ювілей бабусі»' }).click();
    await expect(page).toHaveURL(`/app/collections/${kept.id}/settings`);
    await expect(page.getByRole('heading', { name: T.settingsTitle, level: 1 })).toBeVisible();
    await expect(page.getByLabel(T.title)).toHaveValue('Ювілей бабусі');
  });

  test('the whole row opens the collection; Tab goes from it to settings', async ({
    page,
    isMobile,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Хрестини');
    await page.reload();
    const row = page.getByRole('article').filter({ hasText: 'Хрестини' });
    const titleLink = row.getByRole('link', { name: 'Хрестини', exact: true });
    await expect(titleLink).toHaveAttribute('href', `/app/collections/${id}`);

    if (!isMobile) {
      // One link per row and settings, nothing in between; the row shows the focus ring.
      await titleLink.focus();
      await expect(row).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Налаштування колекції «Хрестини»' }),
      ).toBeFocused();
    }

    // A tap away from the title (on the cover) still opens the collection.
    const cover = await row.locator('[data-slot="tint-tile"]').boundingBox();
    await page.mouse.click(cover!.x + cover!.width / 2, cover!.y + cover!.height / 2);
    await expect(page).toHaveURL(`/app/collections/${id}`);
  });

  test('an empty collection shows its initials and no actions that do not work yet', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Ювілей бабусі');
    await page.reload();
    const strip = page.getByRole('article').filter({ hasText: 'Ювілей бабусі' });
    // The cover is decorative: the initials in the collection's tint, hidden from AT.
    const cover = strip.locator('[data-slot="tint-tile"]');
    await expect(cover).toHaveText('ЮБ');
    await expect(cover).toHaveAttribute('aria-hidden', 'true');
    await expect(strip.getByText('Поки без кадрів')).toBeVisible();
    // Guest links come in slice 2: no QR or copy-link buttons until they work.
    await expect(strip.getByRole('button')).toHaveCount(0);
    // The row link and settings: no separate Open button.
    await expect(strip.getByRole('link')).toHaveCount(2);
  });

  test('at the limit the dialog explains it instead of showing the form', async ({ page }) => {
    await signIn(page, newEmail());
    for (const title of ['Перша', 'Друга', 'Третя']) await createCollectionViaApi(page, title);
    await page.reload();
    await expect(page.getByText('3 з 3 активних колекцій')).toBeVisible();

    await page.getByRole('button', { name: T.newCollection }).click();
    const dialog = page.getByRole('dialog', { name: T.newCollection });
    await expect(dialog.getByText(T.limitTitle)).toBeVisible();
    await expect(dialog.getByLabel(T.title)).toHaveCount(0);
  });
});

test.describe('collection page and settings', () => {
  test('editing the title in settings updates the collection page', async ({ page }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Ювілей');
    await page.goto(`/app/collections/${id}`);
    await expect(page.getByRole('heading', { name: 'Ювілей', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: T.contentEmpty })).toBeVisible();

    await page.getByRole('link', { name: T.settings }).click();
    await expect(page.getByRole('heading', { name: T.settingsTitle, level: 1 })).toBeVisible();
    const title = page.getByRole('textbox', { name: T.title });
    await title.fill('Ювілей бабусі Галини');
    await page.getByRole('button', { name: T.save }).click();
    await expect(toast(page)).toHaveText(T.saved);

    await page.getByRole('link', { name: 'Ювілей бабусі Галини', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ювілей бабусі Галини', level: 1 }),
    ).toBeVisible();
  });

  test('archive from settings, then unarchive from the collection page', async ({ page }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Випускний');
    await page.goto(`/app/collections/${id}/settings`);
    await page.getByRole('button', { name: T.archiveAction }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: T.archiveAction }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('button', { name: T.unarchive })).toBeVisible();

    await page.goto(`/app/collections/${id}`);
    await expect(page.getByText(T.archivedTitle)).toBeVisible();
    await page.goto('/app');
    const card = page.getByRole('article').filter({ hasText: 'Випускний' });
    await expect(card.getByText(T.archived, { exact: true })).toBeVisible();

    await card.getByRole('link', { name: 'Випускний', exact: true }).click();
    await page.getByRole('button', { name: T.unarchive }).click();
    await expect(page.getByText(T.archivedTitle)).toBeHidden();
    await page.getByRole('link', { name: T.back }).click();
    await expect(card.getByText(T.active, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: T.archive })).toHaveCount(0);
  });

  test('delete asks first; Escape cancels and returns focus to the button', async ({ page }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Залишиться');
    const { id } = await createCollectionViaApi(page, 'Зайва');
    await page.goto(`/app/collections/${id}/settings`);
    const remove = page.getByRole('button', { name: T.deleteAction, exact: true });
    // The keyboard path (Safari does not focus a tapped button, so there is nothing to return to).
    await remove.focus();
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('alertdialog', { name: 'Видалити «Зайва»?' });
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(remove).toBeFocused();

    await remove.click();
    await confirm.getByRole('button', { name: T.deleteConfirm }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(toast(page)).toHaveText(T.deleted);
    await expect(page.getByRole('link', { name: 'Зайва', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Залишиться', exact: true })).toBeVisible();
    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();
  });
});

test.describe('long text at 360px (Review Focus 4)', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only');

  test('a 100-character unbroken title and a 1000-character description fit the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const title = 'Ж'.repeat(100);
    await signIn(page, newEmail());
    await createCollectionViaApi(page, title, 'д'.repeat(1000));
    await page.reload();
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveAttribute(
      'title',
      title,
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('isolation and stale screens', () => {
  test("another admin's collection is not found, on the page and in the API (Review Focus 2)", async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Чужа колекція');

    const other = await browser.newContext({ locale: 'de-DE' });
    const intruder = await other.newPage();
    await signIn(intruder, newEmail());
    for (const path of [`/app/collections/${id}`, `/app/collections/${id}/settings`]) {
      await intruder.goto(path);
      await expect(intruder.getByRole('heading', { name: T.notFound, level: 1 })).toBeVisible();
      await expect(intruder.getByText('Чужа колекція')).toHaveCount(0);
      await expect(intruder.locator('main').getByRole('alert')).toHaveCount(0);
    }
    const patch = await intruder.request.patch(`/api/v1/collections/${id}`, {
      data: { title: 'Моя тепер' },
      headers: { origin: new URL(intruder.url()).origin },
    });
    expect(patch.status()).toBe(404);
    await other.close();

    // The owner still sees it unchanged.
    await page.goto(`/app/collections/${id}`);
    await expect(page.getByRole('heading', { name: 'Чужа колекція', level: 1 })).toBeVisible();
  });

  test('a malformed id shows the same not-found state', async ({ page }) => {
    await signIn(page, newEmail());
    await page.goto('/app/collections/not-a-uuid');
    await expect(page.getByRole('heading', { name: T.notFound, level: 1 })).toBeVisible();
    // (Next.js's route announcer is an alert outside `main`.)
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  });

  test('archiving frees a slot; unarchiving at the limit explains why (Review Focus 3)', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Перша');
    await createCollectionViaApi(page, 'Друга');
    const { id } = await createCollectionViaApi(page, 'Третя');

    await page.goto(`/app/collections/${id}/settings`);
    await page.getByRole('button', { name: T.archiveAction }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.archiveAction }).click();
    await expect(page.getByRole('button', { name: T.unarchive })).toBeVisible();

    await page.goto('/app');
    await expect(page.getByText('2 з 3 активних колекцій')).toBeVisible();
    await page.getByRole('button', { name: T.newCollection }).click();
    const dialog = page.getByRole('dialog', { name: T.newCollection });
    await dialog.getByLabel(T.title).fill('Четверта');
    await dialog.getByRole('button', { name: T.create }).click();
    await expect(page.getByRole('heading', { name: 'Четверта', level: 1 })).toBeVisible();

    await page.goto(`/app/collections/${id}`);
    await page.getByRole('button', { name: T.unarchive }).click();
    await expect(page.getByText(LIMIT_ERROR)).toBeVisible();
    await expect(page.getByText(T.archived, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: T.unarchive })).toHaveCount(0);
  });

  test('after delete, Back to the collection shows not-found without an error toast (Review Focus 5)', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Залишиться');
    await createCollectionViaApi(page, 'Зайва');
    await page.reload();
    await page.getByRole('link', { name: 'Зайва', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Зайва', level: 1 })).toBeVisible();
    const overview = page.url();
    await page.getByRole('link', { name: T.settings }).click();
    await page.getByRole('button', { name: T.deleteAction, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.deleteConfirm }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(overview);
    await expect(page.getByRole('heading', { name: T.notFound, level: 1 })).toBeVisible();
    // Nothing keeps failing in the background: no error toast, no error alert.
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-slot="toast"][data-variant="error"]')).toHaveCount(0);
    // (Next.js's route announcer is an alert outside `main`.)
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/\/app$/);
    const usage = (await (await page.request.get('/api/v1/me/usage')).json()) as {
      activeCollections: { used: number; limit: number };
    };
    const { used, limit } = usage.activeCollections;
    await expect(page.getByText(`${used} з ${limit} активних колекцій`)).toBeVisible();
    expect(used).toBe(1);
  });
});

test.describe('long text on every screen (Review Focus 4)', () => {
  test('no sideways scroll on the dashboard, the dialog, the page and settings', async ({
    page,
  }) => {
    const title = 'Ж'.repeat(100);
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, title, 'д'.repeat(1000));

    await page.reload();
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: T.newCollection }).click();
    const dialog = page.getByRole('dialog', { name: T.newCollection });
    await dialog.getByLabel(T.title).fill(title);
    await dialog.getByLabel(T.description).fill('д'.repeat(1000));
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const box = await dialog.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');

    await page.goto(`/app/collections/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.goto(`/app/collections/${id}/settings`);
    await expect(page.getByRole('heading', { name: T.settingsTitle, level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test('keyboard only: create a collection from the dashboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard path on desktop');
  await signIn(page, newEmail());
  await expect(page.getByRole('heading', { name: T.emptyTitle })).toBeVisible();
  const newButton = page.getByRole('button', { name: T.newCollection });
  for (
    let i = 0;
    i < 10 && !(await newButton.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(newButton).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: T.newCollection });
  await expect(dialog.getByLabel(T.title)).toBeFocused();
  await page.keyboard.type('Хрестини Марійки');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Хрестини Марійки', level: 1 })).toBeVisible();
});
