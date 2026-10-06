import { expect, type Locator, type Page, test } from '@playwright/test';
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
  active: 'Колекція активна',
  archived: 'В архіві',
  back: 'Колекції',
  limitTitle: 'Ліміт активних колекцій вичерпано',
  settings: 'Редагувати колекцію',
  settingsTitle: 'Параметри колекції',
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
  details: 'Основна інформація',
};

const LIMIT_ERROR = 'Досягнуто ліміту активних колекцій. Заархівуйте одну, щоб звільнити місце.';

const toast = (page: Page) => page.locator('[data-slot="toast-title"]');

/** The collection page's «Параметри колекції» tab (archive, delete). */
async function openOptions(page: Page, id: string): Promise<void> {
  await page.goto(`/app/collections/${id}?tab=settings`);
  await expect(page.getByRole('tab', { name: 'Параметри колекції' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/** Opens a collection's «⋯» (on its card) or «Дії» (its page) and picks an item. */
async function act(scope: Page | Locator, title: string, item: string): Promise<void> {
  await scope.getByRole('button', { name: `Дії з колекцією «${title}»` }).click();
  const page = 'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page);
  await page.getByRole('menuitem', { name: item }).click();
}

/** A collection's card on the dashboard. */
const card = (page: Page, title: string): Locator =>
  page.locator('[data-slot="collection-card"]').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });

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
    await expect(
      card(page, 'Весілля Олі та Тараса').getByText(T.active, { exact: true }),
    ).toBeVisible();
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

  test('active and archived collections share one list; the «Стан» menu filters it', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    const kept = await createCollectionViaApi(page, 'Ювілей бабусі', 'Рядок 1\nРядок 2');
    const old = await createCollectionViaApi(page, 'Випускний 2025');
    await archiveCollectionViaApi(page, old.id);
    await page.reload();

    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();
    // The «Стан» filter (S2): a menu of checkboxes with counts of what is loaded; nothing checked
    // shows everything with the «Архів · 1» group heading.
    const filter = page.getByRole('button', { name: /^Стан:/ });
    await expect(filter).toHaveText('Стан: Усі');
    await expect(page.locator('[data-slot="collections-group"]')).toHaveText('Архів · 1');
    await filter.click();
    await expect(page.getByRole('menuitemcheckbox')).toHaveText([
      'Активні1',
      'В архіві1',
      'Заблоковані0',
    ]);
    const archivedCard = card(page, 'Випускний 2025');
    await expect(archivedCard.getByText(T.archived, { exact: true })).toBeVisible();
    await expect(
      archivedCard.getByRole('link', { name: 'Випускний 2025', exact: true }),
    ).toHaveAttribute('href', `/app/collections/${old.id}`);
    await expect(page.getByRole('link', { name: 'Ювілей бабусі', exact: true })).toHaveAttribute(
      'href',
      `/app/collections/${kept.id}`,
    );

    // One state: only its collections, no group heading, the URL carries it. The menu stays
    // open while ticking (the admin usually ticks more than one).
    await page.getByRole('menuitemcheckbox', { name: /^В архіві/ }).click();
    await expect(filter).toHaveText('Стан: В архіві');
    await expect(page).toHaveURL(/[?&]state=archived/);
    await expect(page.locator('[data-slot="collection-card"]')).toHaveCount(1);
    await expect(archivedCard).toBeVisible();
    await expect(page.locator('[data-slot="collections-group"]')).toHaveCount(0);
    // Two states (OR): both back, «2 вибрано»; the menu stayed open for the second tick.
    await page.getByRole('menuitemcheckbox', { name: /^Активні/ }).click();
    await expect(filter).toHaveText('Стан: 2 вибрано');
    await expect(page.locator('[data-slot="collection-card"]')).toHaveCount(2);
    // «Скинути» clears to all.
    await page.getByRole('menuitem', { name: 'Скинути' }).click();
    await expect(filter).toHaveText('Стан: Усі');
    await expect(page).not.toHaveURL(/state=/);
    await expect(page.locator('[data-slot="collections-group"]')).toHaveText('Архів · 1');
    // Only active, from the URL.
    await page.goto('/app?state=active');
    await expect(page.locator('[data-slot="collection-card"]')).toHaveCount(1);
    await expect(card(page, 'Ювілей бабусі')).toBeVisible();
  });

  test('search finds by title and says when nothing matches; sort reorders', async ({ page }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Весілля Олі');
    await createCollectionViaApi(page, 'Ювілей бабусі');
    await page.reload();
    const titles = page.locator('[data-slot="collection-link"]');
    // Newest first by default.
    await expect(titles).toHaveText(['Ювілей бабусі', 'Весілля Олі']);

    const search = page.getByRole('searchbox', { name: 'Пошук колекцій' });
    await search.fill('БАБУС');
    await expect(titles).toHaveText(['Ювілей бабусі']);
    await search.fill('хрестини');
    await expect(page.getByText('Немає колекцій з «хрестини» у назві.')).toBeVisible();
    await page.getByRole('button', { name: 'Показати всі' }).click();
    await expect(search).toHaveValue('');
    await expect(titles).toHaveCount(2);

    await page.getByRole('combobox', { name: 'Сортувати:' }).click();
    await page.getByRole('option', { name: 'Найстаріші' }).click();
    await expect(titles).toHaveText(['Весілля Олі', 'Ювілей бабусі']);
  });

  test('a card: «Поділитися» and a «⋯» with archive and delete', async ({ page }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Залишиться');
    await createCollectionViaApi(page, 'Ювілей бабусі');
    await page.reload();
    const strip = card(page, 'Ювілей бабусі');
    await expect(strip.getByRole('button')).toHaveCount(2);
    // 44px touch targets on phones; the desktop table is dense (V1: 32px, mouse only).
    const target = page.viewportSize()!.width < 768 ? 44 : 32;
    for (const name of ['Поділитися', 'Дії з колекцією «Ювілей бабусі»']) {
      const box = await strip.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(target);
      expect(box!.width).toBeGreaterThanOrEqual(target);
    }

    // Archive asks once; the card turns archived in place.
    // From 768px (the table) the «⋯» sits right of the status, at the row's end.
    const badge = await strip.getByText(T.active, { exact: true }).boundingBox();
    const menu = await strip
      .getByRole('button', { name: 'Дії з колекцією «Ювілей бабусі»' })
      .boundingBox();
    if (page.viewportSize()!.width >= 768) {
      expect(menu!.x).toBeGreaterThan(badge!.x + badge!.width - 1);
    }
    await act(strip, 'Ювілей бабусі', T.archiveAction);
    const archive = page.getByRole('alertdialog', { name: 'Архівувати «Ювілей бабусі»?' });
    await archive.getByRole('button', { name: T.archiveAction }).click();
    await expect(archive).toBeHidden();
    await expect(toast(page).filter({ hasText: T.archivedTitle })).toBeVisible();
    await expect(strip.getByText(T.archived, { exact: true })).toBeVisible();
    await expect(page.getByText('1 з 3 активних колекцій')).toBeVisible();

    // Bringing it back asks once too.
    await act(strip, 'Ювілей бабусі', T.unarchive);
    const unarchive = page.getByRole('alertdialog', {
      name: 'Повернути «Ювілей бабусі» з архіву?',
    });
    await unarchive.getByRole('button', { name: T.unarchive }).click();
    await expect(unarchive).toBeHidden();
    await expect(strip.getByText(T.active, { exact: true })).toBeVisible();

    // Delete asks for the title typed.
    await act(strip, 'Ювілей бабусі', T.deleteAction);
    const remove = page.getByRole('alertdialog', { name: 'Видалити «Ювілей бабусі»?' });
    const confirm = remove.getByRole('button', { name: T.deleteConfirm });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await remove
      .getByRole('textbox', { name: 'Щоб підтвердити, введіть «Ювілей бабусі»' })
      .fill('Ювілей бабусі');
    await confirm.click();
    await expect(toast(page).filter({ hasText: T.deleted })).toBeVisible();
    await expect(strip).toHaveCount(0);
    await expect(card(page, 'Залишиться')).toBeVisible();
  });

  test('unarchiving at the limit from a card says why inside the dialog', async ({ page }) => {
    await signIn(page, newEmail());
    const old = await createCollectionViaApi(page, 'Стара');
    await archiveCollectionViaApi(page, old.id);
    for (const title of ['Перша', 'Друга', 'Третя']) await createCollectionViaApi(page, title);
    await page.reload();
    await act(card(page, 'Стара'), 'Стара', T.unarchive);
    const dialog = page.getByRole('alertdialog', { name: 'Повернути «Стара» з архіву?' });
    await dialog.getByRole('button', { name: T.unarchive }).click();
    await expect(dialog.getByText(LIMIT_ERROR)).toBeVisible();
    // Nothing changed: still archived once the dialog is closed.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card(page, 'Стара').getByText(T.archived, { exact: true })).toBeVisible();
  });

  test('the «Параметри колекції» tab deletes and returns to the collections', async ({ page }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Зайва');
    await openOptions(page, id);
    await page.getByRole('button', { name: T.deleteAction, exact: true }).click();
    const remove = page.getByRole('alertdialog', { name: 'Видалити «Зайва»?' });
    await remove.getByRole('button', { name: T.deleteConfirm }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(toast(page).filter({ hasText: T.deleted })).toBeVisible();
    await expect(page.getByRole('heading', { name: T.emptyTitle })).toBeVisible();
  });

  test('the whole card opens the collection; Tab goes from it to «Поділитися»', async ({
    page,
    isMobile,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Хрестини');
    await page.reload();
    const row = card(page, 'Хрестини');
    const titleLink = row.getByRole('link', { name: 'Хрестини', exact: true });
    await expect(titleLink).toHaveAttribute('href', `/app/collections/${id}`);

    if (!isMobile) {
      // The title link, then the row's «Поділитися» and «⋯» in the order they are shown (the
      // V1 table); the row shows the focus ring.
      await titleLink.focus();
      await expect(row).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Tab');
      await expect(row.getByRole('button', { name: 'Поділитися' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(row.getByRole('button', { name: 'Дії з колекцією «Хрестини»' })).toBeFocused();
    }

    // A tap away from the title (on the cover) still opens the collection.
    const cover = await row.locator('[data-slot="collection-cover"]').boundingBox();
    await page.mouse.click(cover!.x + cover!.width / 2, cover!.y + cover!.height / 2);
    await expect(page).toHaveURL(`/app/collections/${id}`);
  });

  test('a card shows its initials, what guests may add, and opens the link and its QR', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Ювілей бабусі');
    await page.reload();
    const strip = card(page, 'Ювілей бабусі');
    // The cover is decorative: the initials in the collection's tint, hidden from AT.
    const cover = strip.locator('[data-slot="collection-cover"]');
    await expect(cover).toHaveText('ЮБ');
    await expect(cover).toHaveAttribute('aria-hidden', 'true');
    // The main link's real permissions (G3: everything to add), no invented counts.
    await expect(
      strip.getByRole('list', { name: 'Гості можуть додавати' }).getByRole('listitem'),
    ).toHaveText(['Фото', 'Відео', 'Документи', 'Побажання']);
    await expect(strip).not.toContainText('гост');

    // One share action (owner 2026-10-02): the QR with its download, the link, its state.
    await strip.getByRole('button', { name: 'Поділитися' }).click();
    const dialog = page.getByRole('dialog', { name: 'Поділитися з гостями' });
    // The card shares the main link, and the dialog says so.
    // One live link: it is named as plain text, no one-option select.
    await expect(dialog.locator('[data-slot="share-link-status"]')).toContainText(
      'Основне посилання',
    );
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(
      dialog.getByRole('img', { name: 'QR-код посилання “Основне посилання”' }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Завантажити для друку (PNG)' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Копіювати' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /^Відкрити/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await expect(dialog.locator('[data-slot="share-link-status"]')).toHaveText(/Активне$/);
    // No way out to other screens from here: the dialog is about sharing only.
    await expect(dialog.getByRole('link', { name: 'Керувати посиланнями' })).toHaveCount(0);
    expect(id).toBeTruthy();
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

test.describe('dashboard view (V1, owner 2026-10-06)', () => {
  test('«Таблиця» is the default; «Плитки» switches and is remembered in this browser', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'phones always show the cards (next test)');
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Хрестини Марійки');
    await page.reload();
    const view = page.getByRole('radiogroup', { name: 'Вигляд' });
    await expect(view.getByRole('radio', { name: 'Таблиця' })).toBeChecked();
    await expect(page.locator('[data-slot="collections-table"]')).toBeVisible();
    await expect(card(page, 'Хрестини Марійки')).toHaveAttribute('data-view', 'table');

    await view.getByRole('radio', { name: 'Плитки' }).click();
    await expect(view.getByRole('radio', { name: 'Плитки' })).toBeChecked();
    await expect(page.locator('[data-slot="collections-tiles"]')).toBeVisible();
    await expect(page.locator('[data-slot="collections-table"]')).toHaveCount(0);
    await expect(card(page, 'Хрестини Марійки')).toHaveAttribute('data-view', 'tiles');

    // Remembered after a reload, per browser.
    await page.reload();
    await expect(view.getByRole('radio', { name: 'Плитки' })).toBeChecked();
    await expect(card(page, 'Хрестини Марійки')).toHaveAttribute('data-view', 'tiles');

    // The keyboard path: arrows move the focus, Enter selects.
    await view.getByRole('radio', { name: 'Плитки' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(view.getByRole('radio', { name: 'Таблиця' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(view.getByRole('radio', { name: 'Таблиця' })).toBeChecked();
    await expect(card(page, 'Хрестини Марійки')).toHaveAttribute('data-view', 'table');
  });

  test('the dashboard still works when the browser refuses storage', async ({ page, isMobile }) => {
    test.skip(isMobile, 'phones always show the cards');
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Ювілей');
    await page.reload();
    const view = page.getByRole('radiogroup', { name: 'Вигляд' });
    await expect(card(page, 'Ювілей')).toHaveAttribute('data-view', 'table');
    await view.getByRole('radio', { name: 'Плитки' }).click();
    await expect(card(page, 'Ювілей')).toHaveAttribute('data-view', 'tiles');
  });

  test('phones always show the cards, without the toggle', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phones only');
    await signIn(page, newEmail());
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('stepler:dashboard-view', 'table');
      } catch {
        // Nothing to set.
      }
    });
    await createCollectionViaApi(page, 'Хрестини Марійки');
    await page.reload();
    await expect(card(page, 'Хрестини Марійки')).toHaveAttribute('data-view', 'card');
    await expect(page.getByRole('radiogroup', { name: 'Вигляд' })).toHaveCount(0);
  });
});

test.describe('collection page and settings', () => {
  test('the title and description are edited on «Параметри колекції»; the header follows', async ({
    page,
  }) => {
    // Owner 2026-10-06: no editing in the header any more; one form on the settings tab.
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Ювілей');
    await page.goto(`/app/collections/${id}`);
    await expect(page.getByRole('heading', { name: 'Ювілей', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: T.contentEmpty })).toBeVisible();
    // The header only shows them: no pencil, no «Додати опис», no actions menu.
    await expect(page.getByRole('button', { name: /^Редагувати/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Додати опис' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Дії з колекцією/ })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Параметри колекції' }).click();
    const form = page.getByRole('form', { name: 'Назва й опис' });
    const title = form.getByRole('textbox', { name: 'Назва' });
    const description = form.getByRole('textbox', { name: /^Опис/ });
    const save = form.getByRole('button', { name: 'Зберегти' });
    const cancel = form.getByRole('button', { name: 'Скасувати' });
    await expect(title).toHaveValue('Ювілей');
    await expect(description).toHaveValue('');
    // Nothing changed: nothing to save.
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // An empty title is explained next to the field and cannot be saved.
    await title.fill('');
    await expect(form.getByText('Введіть назву')).toBeVisible();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    // «Скасувати» puts the saved values back.
    await cancel.click();
    await expect(title).toHaveValue('Ювілей');

    // Rename and add a description (line breaks kept), then save.
    await title.fill('Ювілей бабусі Галини');
    await description.fill('Субота, 14:00\nРесторан «Липа»');
    await save.click();
    await expect(toast(page).filter({ hasText: 'Збережено' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ювілей бабусі Галини', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Ресторан «Липа»').first()).toBeVisible();
    // The breadcrumbs follow.
    await expect(page.getByRole('navigation', { name: 'Де ви зараз' })).toContainText(
      'Ювілей бабусі Галини',
    );
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Clearing the description saves none; the header drops it.
    await description.fill('');
    await save.click();
    await expect(page.locator('main').getByText('Ресторан «Липа»')).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Ювілей бабусі Галини', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Ресторан «Липа»')).toHaveCount(0);
    await expect(description).toHaveValue('');

    // And the dashboard shows the new title.
    await page.goto('/app');
    await expect(
      page.getByRole('link', { name: 'Ювілей бабусі Галини', exact: true }),
    ).toBeVisible();
  });

  test('archive from settings, then unarchive from the collection page', async ({ page }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Випускний');
    await openOptions(page, id);
    await page.getByRole('button', { name: T.archiveAction }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: T.archiveAction }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('button', { name: T.unarchive })).toBeVisible();

    await page.goto(`/app/collections/${id}`);
    await expect(page.getByText(T.archivedTitle)).toBeVisible();
    await page.goto('/app');
    const archived = card(page, 'Випускний');
    await expect(archived.getByText(T.archived, { exact: true })).toBeVisible();

    await archived.getByRole('link', { name: 'Випускний', exact: true }).click();
    await page.getByRole('button', { name: T.unarchive }).click();
    await expect(page.getByText(T.archivedTitle)).toBeHidden();
    // The trail is in the top bar on a computer (owner 2026-10-06) and in the page on phones.
    await page
      .getByRole('navigation', { name: 'Де ви зараз' })
      .getByRole('link', { name: T.back })
      .click();
    await expect(archived.getByText(T.active, { exact: true })).toBeVisible();
  });

  test('delete asks first; Escape cancels and returns focus to the button', async ({ page }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Залишиться');
    const { id } = await createCollectionViaApi(page, 'Зайва');
    await openOptions(page, id);
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

    await openOptions(page, id);
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
    await page.getByRole('tab', { name: 'Параметри колекції' }).click();
    const overview = page.url();
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

test.describe('dashboard card and settings layout (owner review 2026-10-02)', () => {
  test('a card shows its status, the description, the date and the link state', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    await createCollectionViaApi(page, 'Хрестини Марка', 'Неділя, 12:00');
    await page.reload();
    const strip = card(page, 'Хрестини Марка');
    await expect(strip.getByText(T.active, { exact: true })).toBeVisible();
    const meta = strip.locator('[data-slot="collection-meta"]');
    await expect(meta.getByText('Посилання активне', { exact: true })).toBeVisible();
    // The card says «Створено …»; the table's column header says it (cells carry it for
    // screen readers).
    await expect(meta).toContainText('Створено');
    // On a card the description sits under the title, above the date and link state; in the
    // desktop table (V1) they are columns of the same row.
    if ((await strip.getAttribute('data-view')) === 'card') {
      const description = await strip.getByText('Неділя, 12:00').boundingBox();
      const metaBox = await meta.boundingBox();
      expect(description!.y + description!.height).toBeLessThanOrEqual(metaBox!.y);
    } else {
      await expect(strip.getByText('Неділя, 12:00')).toBeVisible();
    }
  });
});

test.describe('admin navigation (owner decisions 2026-10-02)', () => {
  test('the sidebar has the two sections only; breadcrumbs say where you are', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the sidebar is a sheet on phones (next test)');
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Ювілей');
    const nav = page.getByRole('navigation', { name: 'Розділи' });
    await expect(nav.getByRole('link')).toHaveText(['Колекції', 'Акаунт']);
    await expect(nav.getByRole('link', { name: 'Колекції' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Inside a collection: «Колекції» is the current section; no sub-group duplicates the tabs.
    await openOptions(page, id);
    await expect(nav.getByRole('link', { name: 'Колекції' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(nav.getByRole('link')).toHaveText(['Колекції', 'Акаунт']);
    await expect(
      page.getByRole('navigation', { name: 'Де ви зараз' }).getByRole('listitem'),
    ).toHaveText(['Колекції', 'Ювілей']);

    await nav.getByRole('link', { name: 'Акаунт' }).click();
    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { name: 'Акаунт', level: 1 })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Акаунт' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Колекції' })).not.toHaveAttribute('aria-current');
    // The old address still works.
    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/app\/account$/);
  });

  test('the sidebar folds to an icon rail, keeps the names, and remembers it', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop only: phones use the menu sheet');
    await signIn(page, newEmail());
    const nav = page.getByRole('navigation', { name: 'Розділи' });
    const toggle = page.getByRole('button', { name: 'Згорнути меню' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const wide = (await page.locator('#admin-sidebar').boundingBox())!.width;
    await toggle.click();
    const expand = page.getByRole('button', { name: 'Розгорнути меню' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(async () => (await page.locator('#admin-sidebar').boundingBox())!.width)
      .toBeLessThan(wide);
    // The names stay for screen readers and show as a tooltip on focus.
    await expect(nav.getByRole('link', { name: 'Колекції' })).toBeVisible();
    await nav.getByRole('link', { name: 'Акаунт' }).focus();
    await expect(page.getByRole('tooltip')).toHaveText('Акаунт');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Розгорнути меню' })).toBeVisible();
    await page.getByRole('button', { name: 'Розгорнути меню' }).click();
    await expect(page.getByRole('button', { name: 'Згорнути меню' })).toBeVisible();
  });

  test('the collection mini-nav folds to a rail, is remembered, and starts folded in the editor under 1700px @desktop', async ({
    page,
  }) => {
    await signIn(page, newEmail());
    const { id } = await createCollectionViaApi(page, 'Весілля Олі та Тараса');
    const miniNav = page.locator('#collection-mini-nav');
    const tab = (name: string) => miniNav.getByRole('tab', { name });
    const sidebarBefore = async () => (await page.locator('#admin-sidebar').boundingBox())!;

    // 1512×982 (a 14-inch laptop): the content tab starts expanded.
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto(`/app/collections/${id}`);
    const fold = page.getByRole('button', { name: 'Згорнути панель колекції' });
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(fold).toHaveAttribute('aria-controls', 'collection-mini-nav');
    await expect(miniNav.getByRole('heading', { level: 1 })).toHaveText('Весілля Олі та Тараса');
    const expandedWidth = (await miniNav.boundingBox())!.width;
    expect(Math.round(expandedWidth)).toBe(350);
    const sidebar = await sidebarBefore();

    // From the keyboard; the rail keeps the tab names (tooltips), the h1 and «Поділитися».
    await fold.focus();
    await page.keyboard.press('Enter');
    const unfold = page.getByRole('button', { name: 'Розгорнути панель колекції' });
    await expect(unfold).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => Math.round((await miniNav.boundingBox())!.width)).toBe(64);
    await expect(miniNav.getByRole('heading', { level: 1 })).toHaveText('Весілля Олі та Тараса');
    await expect(miniNav.getByRole('button', { name: 'Поділитися' })).toBeVisible();
    await expect(tab('Вміст')).toHaveAttribute('aria-selected', 'true');
    // The highlight sits on the active icon (the tab's own state, not the tooltip's).
    await expect(tab('Вміст')).toHaveAttribute('data-state', 'active');
    await expect(miniNav.locator('[data-slot="segment-thumb"]')).toHaveCSS('opacity', '1');
    await tab('Посилання').focus();
    await expect(page.getByRole('tooltip', { name: 'Посилання' })).toBeVisible();
    // The admin sidebar never moves (remark 29), nor does the top bar's trail.
    expect(await sidebarBefore()).toEqual(sidebar);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Колекції' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Remembered on reload and on the other tabs.
    await page.reload();
    await expect(unfold).toBeVisible();
    await tab('Посилання').click();
    await expect(page).toHaveURL(/tab=links/);
    await expect(unfold).toBeVisible();
    await unfold.click();
    await expect(fold).toBeVisible();

    // The editor under 1700px starts folded, though the other tabs are expanded…
    await tab('Гостьова сторінка').click();
    await expect(unfold).toBeVisible();
    // …until expanded there, which is remembered for the editor.
    await unfold.click();
    await expect(fold).toBeVisible();
    await page.reload();
    await expect(tab('Гостьова сторінка')).toHaveAttribute('aria-selected', 'true');
    await expect(fold).toBeVisible();

    // A fresh browser state at 1920: the editor follows the other tabs (expanded).
    await page.evaluate(() => window.localStorage.clear());
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await expect(fold).toBeVisible();
    await page.setViewportSize({ width: 1512, height: 982 });
    await expect(unfold).toBeVisible();
  });

  test('on phones the sections open from the menu button', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phones only');
    await signIn(page, newEmail());
    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    const sheet = page.getByRole('dialog', { name: 'Розділи' });
    const nav = sheet.getByRole('navigation', { name: 'Розділи' });
    await expect(nav.getByRole('link', { name: 'Колекції' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: 'Акаунт' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/app\/account$/);
  });

  test('the skip link moves focus to the page content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard path on desktop');
    await signIn(page, newEmail());
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Перейти до вмісту' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
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

    await openOptions(page, id);
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
