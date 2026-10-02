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
    for (const type of ['Фото', 'Відео', 'Документи', 'Побажання']) {
      await expect(card.getByRole('checkbox', { name: type })).toBeChecked();
    }
    await expect(card.getByRole('radio', { name: /^Лише своє/ })).toBeChecked();
    await expect(card.getByRole('switch', { name: T.works })).toBeChecked();
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
    await openLinks(page, 'Хрестини');
    const card = mainCard(page);
    const documents = card.getByRole('checkbox', { name: 'Документи' });
    const save = card.getByRole('button', { name: T.save });
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    await documents.click();
    await expect(card.getByText('Є незбережені зміни.')).toBeVisible();
    await card.getByRole('button', { name: 'Скасувати' }).click();
    await expect(documents).toBeChecked();

    await documents.click();
    await card.getByRole('radio', { name: /^Вміст усіх гостей/ }).click();
    await save.click();
    await expect(toast(page).filter({ hasText: 'Права збережено' })).toBeVisible();
    await page.reload();
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

  test('an additional link is created, then revoked into the record', async ({ page }) => {
    await openLinks(page, 'Корпоратив');
    await page.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Фотограф');
    await create.getByRole('checkbox', { name: 'Побажання' }).click();
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання створено' })).toBeVisible();

    const extra = page.getByRole('region', { name: 'Фотограф' });
    await expect(extra.getByRole('heading', { name: 'Фотограф', level: 3 })).toBeVisible();
    await expect(extra.getByRole('checkbox', { name: 'Побажання' })).not.toBeChecked();

    await extra.getByRole('button', { name: 'Відкликати посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Відкликати «Фотограф»?' });
    await dialog.getByRole('textbox').fill('Фотограф');
    await dialog.getByRole('button', { name: 'Відкликати' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання відкликано' })).toBeVisible();
    await expect(extra).toBeHidden();
    const record = page.getByRole('region', { name: 'Відкликані' });
    const label = record.getByText('Фотограф', { exact: true });
    await expect(label).toHaveCSS('text-decoration-line', 'line-through');
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
    await mainCard(page).getByRole('switch', { name: T.works }).click();
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
