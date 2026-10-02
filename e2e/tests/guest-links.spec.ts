import { expect, type Locator, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi } from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  links: 'Посилання',
  main: 'Основне посилання',
  active: 'Активне',
  paused: 'Призупинене',
  link: 'Посилання',
  copy: 'Копіювати',
  copied: 'Скопійовано',
  downloadQr: 'Завантажити QR',
  png: 'PNG для друку',
  svg: 'SVG',
  save: 'Зберегти',
  rotate: 'Оновити посилання',
  works: 'Посилання працює',
};

const toast = (page: Page) => page.locator('[data-slot="toast-title"]');

async function openLinks(page: Page, title: string): Promise<{ id: string }> {
  await signIn(page, newEmail());
  const collection = await createCollectionViaApi(page, title);
  await page.goto(`/app/collections/${collection.id}`);
  await page
    .getByRole('navigation', { name: 'Розділи колекції' })
    .getByRole('link', { name: T.links })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/collections/${collection.id}/links$`));
  return collection;
}

const mainCard = (page: Page): Locator => page.getByRole('region', { name: T.main });

/** Opens a card's accordion («Керувати») unless it is open. */
async function manage(card: Locator, name: string): Promise<void> {
  const toggle = card.getByRole('button', { name: `Керувати «${name}»` });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('links tab', () => {
  test('a new collection has an active main link with its QR code and default permissions', async ({
    page,
  }) => {
    await openLinks(page, 'Весілля Олі та Тараса');
    const nav = page.getByRole('navigation', { name: 'Розділи колекції' });
    await expect(nav.getByRole('link')).toHaveText(['Вміст', 'Посилання']);
    await expect(nav.getByRole('link', { name: T.links })).toHaveAttribute('aria-current', 'page');
    // Settings are a page of their own, opened from the header.
    await expect(page.getByRole('link', { name: 'Налаштування' })).toBeVisible();

    const card = mainCard(page);
    await expect(card.getByRole('heading', { name: T.main, level: 2 })).toBeVisible();
    await expect(card.getByText(T.active, { exact: true })).toBeVisible();
    await expect(card.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(card.getByRole('textbox', { name: T.link })).toHaveValue(
      /\/g\/[A-Za-z0-9_-]{43}$/,
    );
    // Closed, the header still says what guests can do; the controls are behind «Керувати».
    await expect(card.getByText(/^Гості можуть додавати фото, відео, документи/)).toBeVisible();
    await expect(card.getByRole('checkbox')).toHaveCount(0);
    await manage(card, T.main);
    for (const type of ['Фото', 'Відео', 'Документи', 'Побажання']) {
      await expect(card.getByRole('checkbox', { name: type })).toBeChecked();
    }
    await expect(card.getByRole('radio', { name: /^Лише своє/ })).toBeChecked();
    await expect(card.getByRole('switch', { name: T.works })).toBeChecked();
    // The main link can only be replaced; the danger zone says so and offers no delete.
    await expect(card.getByRole('button', { name: T.rotate })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Видалити посилання' })).toHaveCount(0);
    await expect(
      card.getByText('Основне посилання не можна видалити — лише оновити.'),
    ).toBeVisible();
    // No additional links yet: an empty card asks for one.
    const extra = page.getByRole('region', { name: 'Додаткові посилання' });
    await expect(extra.getByText('Додаткових посилань ще немає')).toBeVisible();
    await expect(extra.getByRole('button', { name: 'Нове посилання' })).toHaveCount(1);
  });

  test('the link copies, and the QR downloads as PNG and SVG', async ({
    page,
    context,
    browserName,
  }) => {
    await openLinks(page, 'Ювілей: бабусі/Галини');
    const card = mainCard(page);
    const url = await card.getByRole('textbox', { name: T.link }).inputValue();

    // WebKit has no clipboard permission to grant; there the fallback (select) is covered by stories.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await card.getByRole('button', { name: T.copy }).click();
      await expect(card.getByRole('button', { name: T.copied })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    }

    for (const [item, extension] of [
      [T.png, 'png'],
      [T.svg, 'svg'],
    ] as const) {
      await card.getByRole('button', { name: T.downloadQr }).click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: item }).click();
      const download = await downloading;
      // WebKit reports the name decomposed (NFD).
      expect(download.suggestedFilename().normalize('NFC')).toBe(
        `stepler-qr-Ювілей бабусі Галини.${extension}`,
      );
    }
  });

  test('permissions change only on Save; Cancel puts them back', async ({ page }) => {
    const collection = await openLinks(page, 'Хрестини');
    const card = mainCard(page);
    await manage(card, T.main);
    const documents = card.getByRole('checkbox', { name: 'Документи' });
    const save = card.getByRole('button', { name: T.save });
    // Nothing changed: no Save to press.
    await expect(save).toHaveCount(0);

    await documents.click();
    // A warning bar with Save and Cancel, announced; the header flags it too.
    await expect(card.getByRole('status').filter({ hasText: 'Є незбережені зміни' })).toHaveText(
      'Є незбережені зміни — гості їх ще не бачать.',
    );
    await expect(card.getByText('Не збережено', { exact: true })).toBeVisible();
    // It survives closing the card.
    await card.getByRole('button', { name: `Керувати «${T.main}»` }).click();
    await expect(card.getByText('Не збережено', { exact: true })).toBeVisible();
    await manage(card, T.main);
    await expect(documents).not.toBeChecked();

    // Leaving through an in-app link asks first; dismissing stays on the page.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('не збережено');
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Вміст' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/collections/${collection.id}/links$`));

    await card.getByRole('button', { name: 'Скасувати' }).click();
    await expect(documents).toBeChecked();
    await expect(save).toHaveCount(0);

    await documents.click();
    await card.getByRole('radio', { name: /^Вміст усіх гостей/ }).click();
    await save.click();
    await expect(toast(page).filter({ hasText: 'Права збережено' })).toBeVisible();
    await page.reload();
    await manage(mainCard(page), T.main);
    await expect(mainCard(page).getByRole('checkbox', { name: 'Документи' })).not.toBeChecked();
    await expect(mainCard(page).getByRole('checkbox', { name: 'Фото' })).toBeChecked();
    await expect(mainCard(page).getByRole('radio', { name: /^Вміст усіх гостей/ })).toBeChecked();

    // Nothing to add: a warning that the link is view-only.
    for (const type of ['Фото', 'Відео', 'Побажання']) {
      await mainCard(page).getByRole('checkbox', { name: type }).click();
    }
    await expect(mainCard(page).getByText('Гості нічого не зможуть додати')).toBeVisible();
  });

  test('replacing the main link asks for its name, then shows a new link', async ({ page }) => {
    await openLinks(page, 'Випускний');
    const card = mainCard(page);
    const before = await card.getByRole('textbox', { name: T.link }).inputValue();
    await manage(card, T.main);
    await card.getByRole('button', { name: T.rotate }).click();
    const dialog = page.getByRole('alertdialog', { name: `Оновити «${T.main}»?` });
    await expect(dialog).toContainText('надрукований QR перестануть працювати');
    const confirm = dialog.getByRole('button', { name: 'Оновити' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    const phrase = dialog.getByRole('textbox', { name: `Щоб підтвердити, введіть «${T.main}»` });
    await expect(phrase).toBeFocused();
    await phrase.fill(T.main);
    await expect(confirm).not.toHaveAttribute('aria-disabled');
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(toast(page).filter({ hasText: 'Посилання оновлено' })).toBeVisible();
    await expect(card.getByRole('textbox', { name: T.link })).not.toHaveValue(before);
  });

  test('an additional link is created, revoked into the record, and removed from it', async ({
    page,
  }) => {
    await openLinks(page, 'Корпоратив');
    await page.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Фотограф');
    await create.getByRole('checkbox', { name: 'Побажання' }).click();
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання створено' })).toBeVisible();

    const section = page.getByRole('region', { name: 'Додаткові посилання' });
    await expect(section.locator('[data-slot="extra-links-count"]')).toHaveText('1');
    const extra = page.getByRole('region', { name: 'Фотограф' });
    await expect(extra.getByRole('heading', { name: 'Фотограф', level: 3 })).toBeVisible();
    await manage(extra, 'Фотограф');
    await expect(extra.getByRole('checkbox', { name: 'Побажання' })).not.toBeChecked();

    await extra.getByRole('button', { name: 'Відкликати посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Відкликати «Фотограф»?' });
    await dialog.getByRole('textbox').fill('Фотограф');
    await dialog.getByRole('button', { name: 'Відкликати' }).click();
    await expect(
      page.locator('[data-slot="toast"][data-variant="info"]', { hasText: 'Посилання відкликано' }),
    ).toBeVisible();
    await expect(extra).toBeHidden();
    const record = page.getByRole('region', { name: 'Відкликані' });
    const label = record.getByText('Фотограф', { exact: true });
    await expect(label).toHaveCSS('text-decoration-line', 'line-through');

    // On a phone the toast sits over the list: close it first.
    for (const close of await page.getByRole('button', { name: 'Закрити сповіщення' }).all()) {
      await close.click();
    }
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
    // The record can go too: a plain confirm, the link no longer works anyway.
    await record.getByRole('button', { name: 'Прибрати «Фотограф» з історії' }).click();
    const remove = page.getByRole('alertdialog', { name: 'Прибрати «Фотограф» з історії?' });
    await remove.getByRole('button', { name: 'Прибрати' }).click();
    await expect(toast(page).filter({ hasText: 'Прибрано з історії' })).toBeVisible();
    await expect(record).toBeHidden();
  });

  test('deleting an additional link asks for its name and removes it from the page', async ({
    page,
  }) => {
    await openLinks(page, 'Випускний 11-Б');
    await page.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Батьки');
    await create.getByRole('button', { name: 'Створити' }).click();
    const extra = page.getByRole('region', { name: 'Батьки' });
    await manage(extra, 'Батьки');

    await extra.getByRole('button', { name: 'Видалити посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Видалити «Батьки»?' });
    const confirm = dialog.getByRole('button', { name: 'Видалити' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await dialog.getByRole('textbox', { name: 'Щоб підтвердити, введіть «Батьки»' }).fill('Батьки');
    await confirm.click();
    await expect(toast(page).filter({ hasText: 'Посилання видалено' })).toBeVisible();
    await expect(extra).toBeHidden();
    // Gone from the page, not moved to the record.
    await expect(page.getByRole('region', { name: 'Відкликані' })).toHaveCount(0);
    await expect(page.getByText('Додаткових посилань ще немає')).toBeVisible();
  });
});

test.describe('sharing from the collection page', () => {
  test('Share shows the same link as the Links tab; a paused link is flagged on the dashboard and in Share', async ({
    page,
  }) => {
    const collection = await openLinks(page, 'Хрестини Марійки');
    const linkUrl = await mainCard(page).getByRole('textbox', { name: T.link }).inputValue();

    // Share from the content tab: the same URL and its QR.
    await page.getByRole('link', { name: 'Вміст' }).click();
    const share = page.getByRole('button', { name: 'Поділитися', exact: true });
    await share.click();
    const dialog = page.getByRole('dialog', { name: 'Поділіться з гостями' });
    await expect(dialog.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: T.link })).toHaveValue(linkUrl);
    // Keyboard: Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(share).toBeFocused();

    // Pause on the Links tab; the dashboard says so without a reload.
    await page.getByRole('link', { name: T.links }).click();
    await manage(mainCard(page), T.main);
    await mainCard(page).getByRole('switch', { name: T.works }).click();
    // Paused is a state to come back to: a warning toast, not a success.
    await expect(
      page.locator('[data-slot="toast"][data-variant="warning"]', {
        hasText: 'Посилання призупинено',
      }),
    ).toBeVisible();
    await expect(mainCard(page).getByText(T.paused, { exact: true })).toBeVisible();
    await expect(mainCard(page).getByText('побачать «Посилання призупинене»')).toBeVisible();
    await page.getByRole('link', { name: 'Колекції' }).click();
    await expect(page).toHaveURL(/\/app$/);
    const row = page.locator('[data-slot="collection-strip"]', { hasText: 'Хрестини Марійки' });
    await expect(row.getByText('Посилання призупинене')).toBeVisible();

    // The Share dialog warns and resumes in place; the row is active again.
    await page.goto(`/app/collections/${collection.id}`);
    await page.getByRole('button', { name: 'Поділитися', exact: true }).click();
    await expect(
      dialog.getByText('Посилання призупинене — гості його не відкриють.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Відновити' }).click();
    await expect(dialog.getByText('Посилання призупинене — гості його не відкриють.')).toBeHidden();
    // Escape would first dismiss the «resumed» toast (the top layer); close the dialog itself.
    await dialog.getByRole('button', { name: 'Закрити' }).first().click();
    await page.getByRole('link', { name: 'Колекції' }).click();
    await expect(row.getByText('Посилання активне')).toBeVisible();
  });
});
