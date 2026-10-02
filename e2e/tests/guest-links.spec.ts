import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi } from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  access: 'Доступ',
  guestLink: 'Гостьове посилання',
  active: 'Активне',
  link: 'Посилання',
  copy: 'Копіювати',
  copied: 'Скопійовано',
  downloadQr: 'Завантажити QR',
  png: 'PNG для друку',
  svg: 'SVG',
};

async function openAccess(page: Page, title: string): Promise<{ id: string }> {
  await signIn(page, newEmail());
  const collection = await createCollectionViaApi(page, title);
  await page.goto(`/app/collections/${collection.id}`);
  await page
    .getByRole('navigation', { name: 'Розділи колекції' })
    .getByRole('link', { name: T.access })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/collections/${collection.id}/access$`));
  return collection;
}

test.describe('access page', () => {
  test('a new collection has an active default link with its QR code', async ({ page }) => {
    await openAccess(page, 'Весілля Олі та Тараса');
    await expect(page.getByRole('link', { name: T.access })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const panel = page.locator('[data-slot="link-panel"]');
    await expect(panel.getByRole('heading', { name: T.guestLink, level: 2 })).toBeVisible();
    await expect(panel.getByText(T.active, { exact: true })).toBeVisible();
    await expect(
      panel.getByRole('img', { name: `QR-код посилання “${T.guestLink}”` }),
    ).toBeVisible();
    await expect(panel.getByRole('textbox', { name: T.link })).toHaveValue(
      /\/g\/[A-Za-z0-9_-]{43}$/,
    );
    await expect(
      panel.getByText(
        'Гості можуть додавати фото, відео, документи і побажання та бачити лише своє',
      ),
    ).toBeVisible();
  });

  test('the link copies, and the QR downloads as PNG and SVG', async ({
    page,
    context,
    browserName,
  }) => {
    await openAccess(page, 'Ювілей: бабусі/Галини');
    const panel = page.locator('[data-slot="link-panel"]');
    const url = await panel.getByRole('textbox', { name: T.link }).inputValue();

    // WebKit has no clipboard permission to grant; there the fallback (select) is covered by stories.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await panel.getByRole('button', { name: T.copy }).click();
      await expect(panel.getByRole('button', { name: T.copied })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    }

    for (const [item, extension] of [
      [T.png, 'png'],
      [T.svg, 'svg'],
    ] as const) {
      await panel.getByRole('button', { name: T.downloadQr }).click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: item }).click();
      const download = await downloading;
      // WebKit reports the name decomposed (NFD).
      expect(download.suggestedFilename().normalize('NFC')).toBe(
        `stepler-qr-Ювілей бабусі Галини.${extension}`,
      );
    }
  });
});

test.describe('sharing from the collection page', () => {
  test('Share shows the same link as Access; a paused link is flagged on the dashboard and in Share', async ({
    page,
  }) => {
    const collection = await openAccess(page, 'Хрестини Марійки');
    const accessUrl = await page
      .locator('[data-slot="link-panel"]')
      .getByRole('textbox', { name: T.link })
      .inputValue();

    // Share from the overview: the same URL and its QR.
    await page.getByRole('link', { name: 'Кадри' }).click();
    const share = page.getByRole('button', { name: 'Поділитися', exact: true });
    await share.click();
    const dialog = page.getByRole('dialog', { name: 'Поділіться з гостями' });
    await expect(
      dialog.getByRole('img', { name: `QR-код посилання “${T.guestLink}”` }),
    ).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: T.link })).toHaveValue(accessUrl);
    // Keyboard: Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(share).toBeFocused();

    // Pause on Access; the dashboard says so without a reload.
    await page.getByRole('link', { name: T.access }).click();
    await page.getByRole('button', { name: 'Призупинити' }).click();
    await expect(
      page.locator('[data-slot="link-panel"]').getByText('Призупинене', { exact: true }),
    ).toBeVisible();
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
